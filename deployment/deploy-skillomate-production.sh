#!/usr/bin/env bash

set -Eeuo pipefail

DEPLOYMENT_SCOPE=full
for argument in "$@"; do
  case "$argument" in
    --backend-only) DEPLOYMENT_SCOPE=backend-only ;;
    *) echo "Usage: $0 [--backend-only]"; exit 64 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly LOCAL_REPOSITORY="${SKILLOMATE_LOCAL_REPOSITORY:-$(cd "$SCRIPT_DIR/.." && pwd)}"
readonly REMOTE_DEPLOY_SCRIPT="${SKILLOMATE_REMOTE_DEPLOY_SCRIPT:-$LOCAL_REPOSITORY/deployment/deploy-skillomate.sh}"
readonly SSM_BOOTSTRAP="$LOCAL_REPOSITORY/edunex-b/ssm-bootstrap.js"
readonly SSH_KEY="${SKILLOMATE_SSH_KEY:-$HOME/Downloads/Skillomate_Key.pem}"
readonly SSH_COMMAND="${SKILLOMATE_SSH_COMMAND:-ssh}"
readonly AWS_COMMAND="${SKILLOMATE_AWS_COMMAND:-aws}"
readonly REGION="ap-south-1"
readonly ASG_NAME="skillomate-backend-asg"
readonly TARGET_GROUP_NAME="skillomate-backend-tg"
readonly LOG_DIRECTORY="${SKILLOMATE_DEPLOY_LOG_DIRECTORY:-$HOME/skillomate-deployment-logs}"
readonly LOCK_DIRECTORY="${SKILLOMATE_DEPLOY_LOCK_DIRECTORY:-${TMPDIR:-/tmp}/skillomate-rolling-deploy.lock}"
readonly REMOTE_REPOSITORY="/home/ubuntu/skillomate_repo"

lock_acquired=0
discovery_directory=""

release_lock() {
  if test -n "$discovery_directory"; then
    rm -rf -- "$discovery_directory"
  fi
  if test "$lock_acquired" -eq 1; then
    rm -f -- "$LOCK_DIRECTORY/pid"
    rmdir -- "$LOCK_DIRECTORY" 2>/dev/null || true
  fi
}

acquire_lock() {
  if mkdir -- "$LOCK_DIRECTORY" 2>/dev/null; then
    lock_acquired=1
    printf '%s\n' "$$" >"$LOCK_DIRECTORY/pid"
    return 0
  fi

  local existing_pid=""
  if test -f "$LOCK_DIRECTORY/pid"; then
    existing_pid="$(cat "$LOCK_DIRECTORY/pid" 2>/dev/null || true)"
  fi

  if [[ "$existing_pid" =~ ^[0-9]+$ ]] && kill -0 "$existing_pid" 2>/dev/null; then
    echo "Another Skillomate rolling deployment is already running (PID $existing_pid)."
  else
    echo "Skillomate rolling deployment lock exists but has no live owner: $LOCK_DIRECTORY"
    echo "Inspect and remove the stale lock directory before retrying."
  fi
  exit 75
}

trap release_lock EXIT INT TERM

if test ! -r "$REMOTE_DEPLOY_SCRIPT"; then
  echo "Remote deployment script not found: $REMOTE_DEPLOY_SCRIPT"
  exit 1
fi

if test ! -r "$SSM_BOOTSTRAP"; then
  echo "SSM bootstrap is missing from the local repository: $SSM_BOOTSTRAP"
  exit 1
fi

if ! grep -Fxq '# SKILLOMATE_SSM_DEPLOY_CONTRACT_V1' "$REMOTE_DEPLOY_SCRIPT"; then
  echo "Remote deployment script does not declare the SSM production contract."
  exit 1
fi

if test "$DEPLOYMENT_SCOPE" = backend-only &&
  ! grep -Fxq '# SKILLOMATE_BACKEND_ONLY_DEPLOY_CONTRACT_V1' "$REMOTE_DEPLOY_SCRIPT"; then
  echo "Remote deployment script does not support backend-only deployment."
  exit 1
fi

mkdir -p -- "$LOG_DIRECTORY"
chmod 700 "$LOG_DIRECTORY"
acquire_lock
discovery_directory="$(mktemp -d "${TMPDIR:-/tmp}/skillomate-asg.XXXXXX")"

aws_read() {
  "$AWS_COMMAND" --region "$REGION" "$@" --output json
}

ssm_guidance() {
  echo "Direct SSH to every current ASG instance is required by this script. No deployment was started."
  echo "For private instances, use an immutable launch-template artifact and an ASG Instance Refresh with"
  echo "health checks and rollback, or a reviewed SSM Run Command rolling workflow with per-instance checks."
  echo "Do not use stale public IPs or run this SSH script through an unverified proxy."
}

if ! aws_read autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names "$ASG_NAME" >"$discovery_directory/asg.json"; then
  echo "Could not discover $ASG_NAME in $REGION. No deployment was started."
  exit 1
fi

if ! python3 - "$ASG_NAME" "$discovery_directory/asg.json" >"$discovery_directory/instances" <<'PY'
import json
import sys

name, path = sys.argv[1:]
groups = json.load(open(path, encoding='utf-8')).get('AutoScalingGroups', [])
if len(groups) != 1 or groups[0].get('AutoScalingGroupName') != name:
    sys.exit('Expected exactly one named Auto Scaling Group')
group = groups[0]
instances = group.get('Instances', [])
desired = group.get('DesiredCapacity')
if not instances or len(instances) != desired:
    sys.exit('ASG instance count does not match desired capacity')
for instance in instances:
    if instance.get('LifecycleState') != 'InService' or instance.get('HealthStatus') != 'Healthy':
        sys.exit('ASG contains an instance that is not InService and Healthy')
ids = sorted(instance.get('InstanceId', '') for instance in instances)
if len(set(ids)) != len(ids) or any(not value.startswith('i-') for value in ids):
    sys.exit('ASG returned invalid or duplicate instance IDs')
print('\n'.join(ids))
PY
then
  echo "ASG fleet is not stable and healthy. No deployment was started."
  exit 1
fi

instance_ids=()
while IFS= read -r instance_id; do
  instance_ids+=("$instance_id")
done <"$discovery_directory/instances"

if ! aws_read ec2 describe-instances --instance-ids "${instance_ids[@]}" \
  >"$discovery_directory/ec2.json"; then
  echo "Could not describe current ASG EC2 instances. No deployment was started."
  exit 1
fi

if ! python3 - "$discovery_directory/ec2.json" "${instance_ids[@]}" \
  >"$discovery_directory/hosts" <<'PY'
import ipaddress
import json
import sys

payload = json.load(open(sys.argv[1], encoding='utf-8'))
expected = sys.argv[2:]
instances = [i for r in payload.get('Reservations', []) for i in r.get('Instances', [])]
by_id = {i.get('InstanceId'): i for i in instances}
if len(instances) != len(expected) or set(by_id) != set(expected):
    sys.exit('EC2 instance inventory differs from the ASG')
for instance_id in expected:
    instance = by_id[instance_id]
    if instance.get('State', {}).get('Name') != 'running':
        sys.exit(f'{instance_id} is not running')
    address = instance.get('PublicIpAddress')
    if not address:
        sys.exit(f'{instance_id} has no public IP address')
    try:
        ipaddress.IPv4Address(address)
    except ipaddress.AddressValueError:
        sys.exit(f'{instance_id} has an invalid public IPv4 address')
    print(f'{instance_id}|{address}')
PY
then
  ssm_guidance
  exit 1
fi

if ! aws_read elbv2 describe-target-groups --names "$TARGET_GROUP_NAME" \
  >"$discovery_directory/target-group.json"; then
  echo "Could not describe target group $TARGET_GROUP_NAME. No deployment was started."
  exit 1
fi

target_group_arn="$(python3 - "$TARGET_GROUP_NAME" "$discovery_directory/target-group.json" <<'PY'
import json
import sys

name, path = sys.argv[1:]
groups = json.load(open(path, encoding='utf-8')).get('TargetGroups', [])
if len(groups) != 1 or groups[0].get('TargetGroupName') != name or groups[0].get('TargetType') != 'instance':
    sys.exit('Expected one instance-type target group')
print(groups[0]['TargetGroupArn'])
PY
)" || exit 1

if ! python3 - "$target_group_arn" "$discovery_directory/asg.json" <<'PY'
import json
import sys

arn, path = sys.argv[1:]
group = json.load(open(path, encoding='utf-8'))['AutoScalingGroups'][0]
if arn not in group.get('TargetGroupARNs', []):
    sys.exit('Target group is not attached to the ASG')
PY
then
  echo "Target group does not belong to $ASG_NAME. No deployment was started."
  exit 1
fi

check_target_health() {
  local instance_id=$1
  aws_read elbv2 describe-target-health --target-group-arn "$target_group_arn" \
    >"$discovery_directory/target-health.json" || return 1
  python3 - "$instance_id" "$discovery_directory/target-health.json" <<'PY'
import json
import sys

instance_id, path = sys.argv[1:]
targets = json.load(open(path, encoding='utf-8')).get('TargetHealthDescriptions', [])
matches = [t for t in targets if t.get('Target', {}).get('Id') == instance_id]
if len(matches) != 1 or matches[0].get('TargetHealth', {}).get('State') != 'healthy':
    sys.exit(f'{instance_id} is not a healthy member of the target group')
PY
}

wait_for_target_health() {
  local instance_id=$1
  local attempt
  for attempt in $(seq 1 15); do
    if check_target_health "$instance_id"; then
      return 0
    fi
    sleep 2
  done
  return 1
}

readonly DEPLOYMENT_TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
readonly -a SSH_OPTIONS=(
  -i "$SSH_KEY"
  -o BatchMode=yes
  -o ConnectTimeout=10
  -o ConnectionAttempts=1
  -o StrictHostKeyChecking=yes
)

if test ! -f "$SSH_KEY"; then
  echo "Skillomate SSH key not found: $SSH_KEY"
  echo "Set SKILLOMATE_SSH_KEY to the private-key path and retry."
  exit 1
fi

while IFS='|' read -r instance_id host; do
  if ! check_target_health "$instance_id"; then
    echo "Target group preflight failed for $instance_id. No deployment was started."
    exit 1
  fi
  if ! "$SSH_COMMAND" "${SSH_OPTIONS[@]}" "ubuntu@$host" true >/dev/null 2>&1; then
    echo "SSH preflight failed for $instance_id ($host)."
    ssm_guidance
    exit 1
  fi
done <"$discovery_directory/hosts"

first_host="$(head -n 1 "$discovery_directory/hosts")"
first_host="${first_host#*|}"
TARGET_COMMIT="$("$SSH_COMMAND" "${SSH_OPTIONS[@]}" "ubuntu@$first_host" \
  "git -C '$REMOTE_REPOSITORY' fetch --prune origin main >/dev/null && git -C '$REMOTE_REPOSITORY' rev-parse origin/main")"

if [[ ! "$TARGET_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Could not resolve a valid origin/main commit from the first ASG instance."
  exit 1
fi

echo "Rolling deployment target: $TARGET_COMMIT"
echo "scope=$DEPLOYMENT_SCOPE"
remote_command="bash -s -- '$TARGET_COMMIT'"
if test "$DEPLOYMENT_SCOPE" = backend-only; then
  remote_command="$remote_command --backend-only"
fi

while IFS='|' read -r instance_id host; do
  echo "=== $instance_id ==="
  if ! aws_read autoscaling describe-auto-scaling-instances --instance-ids "$instance_id" \
    >"$discovery_directory/current-asg.json" || \
    ! python3 - "$ASG_NAME" "$instance_id" "$discovery_directory/current-asg.json" <<'PY'
import json
import sys

name, instance_id, path = sys.argv[1:]
instances = json.load(open(path, encoding='utf-8')).get('AutoScalingInstances', [])
if len(instances) != 1 or instances[0].get('InstanceId') != instance_id \
        or instances[0].get('AutoScalingGroupName') != name \
        or instances[0].get('LifecycleState') != 'InService' \
        or str(instances[0].get('HealthStatus', '')).lower() != 'healthy':
    sys.exit('Instance is no longer a healthy InService member of the ASG')
PY
  then
    echo "ASG membership changed for $instance_id. Rolling deployment stopped."
    exit 1
  fi
  if ! check_target_health "$instance_id"; then
    echo "Target health changed for $instance_id. Rolling deployment stopped."
    exit 1
  fi
  if ! aws_read ec2 describe-instances --instance-ids "$instance_id" \
    >"$discovery_directory/current-ec2.json" || \
    ! python3 - "$instance_id" "$host" "$discovery_directory/current-ec2.json" <<'PY'
import json
import sys

instance_id, address, path = sys.argv[1:]
payload = json.load(open(path, encoding='utf-8'))
instances = [i for r in payload.get('Reservations', []) for i in r.get('Instances', [])]
if len(instances) != 1 or instances[0].get('InstanceId') != instance_id \
        or instances[0].get('State', {}).get('Name') != 'running' \
        or instances[0].get('PublicIpAddress') != address:
    sys.exit('EC2 identity or public IP changed during rollout')
PY
  then
    echo "EC2 identity or address changed for $instance_id. Rolling deployment stopped."
    exit 1
  fi
  log_file="$LOG_DIRECTORY/$DEPLOYMENT_TIMESTAMP-$instance_id.log"

  echo "instance_id=$instance_id" >"$log_file"
  echo "host=$host" >>"$log_file"
  echo "target_commit=$TARGET_COMMIT" >>"$log_file"
  echo "config_source=ssm" >>"$log_file"
  echo "scope=$DEPLOYMENT_SCOPE" >>"$log_file"
  chmod 600 "$log_file"

  if "$SSH_COMMAND" "${SSH_OPTIONS[@]}" "ubuntu@$host" \
    "$remote_command" <"$REMOTE_DEPLOY_SCRIPT" 2>&1 | /usr/bin/tee -a "$log_file"; then
    echo "DEPLOY SUCCESS" | /usr/bin/tee -a "$log_file"
  else
    deployment_status=${PIPESTATUS[0]}
    echo "DEPLOY FAILED" | /usr/bin/tee -a "$log_file"
    echo "Rolling deployment stopped at $instance_id. Remaining instances were not touched." | /usr/bin/tee -a "$log_file"
    exit "$deployment_status"
  fi

  if ! wait_for_target_health "$instance_id"; then
    echo "Target group did not return to healthy for $instance_id. Rolling deployment stopped." | /usr/bin/tee -a "$log_file"
    exit 1
  fi

  echo
done <"$discovery_directory/hosts"

echo "ROLLING DEPLOYMENT COMPLETE"
