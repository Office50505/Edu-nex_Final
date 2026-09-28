#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORCHESTRATOR="$SCRIPT_DIRECTORY/deploy-skillomate-production.sh"
TARGET_COMMIT=0123456789abcdef0123456789abcdef01234567
self_test_directory="$(mktemp -d "${TMPDIR:-/tmp}/skillomate-rolling-selftest.XXXXXX")"
live_lock_pid=""
cleanup() {
  if test -n "$live_lock_pid"; then
    kill "$live_lock_pid" 2>/dev/null || true
    wait "$live_lock_pid" 2>/dev/null || true
  fi
  rm -rf -- "$self_test_directory"
}
trap cleanup EXIT

fake_key="$self_test_directory/key.pem"
fake_remote_deployer="$self_test_directory/remote-deploy.sh"
fake_ssh="$self_test_directory/fake-ssh.sh"
fake_aws="$self_test_directory/fake-aws.sh"
ssh_calls="$self_test_directory/ssh-calls.log"
aws_calls="$self_test_directory/aws-calls.log"
touch "$fake_key"
chmod 600 "$fake_key"
printf '#!/usr/bin/env bash\n# SKILLOMATE_SSM_DEPLOY_CONTRACT_V1\nexit 0\n' >"$fake_remote_deployer"

cat >"$fake_aws" <<'FAKE_AWS'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >>"$FAKE_AWS_CALLS"
[[ " $* " == *' --region ap-south-1 '* ]] || exit 90
case "$*" in
  *'autoscaling describe-auto-scaling-groups'*)
    cat <<'JSON'
{"AutoScalingGroups":[{"AutoScalingGroupName":"skillomate-backend-asg","DesiredCapacity":3,"TargetGroupARNs":["arn:aws:elasticloadbalancing:ap-south-1:123:targetgroup/skillomate-backend-tg/123"],"Instances":[{"InstanceId":"i-003","LifecycleState":"InService","HealthStatus":"Healthy"},{"InstanceId":"i-001","LifecycleState":"InService","HealthStatus":"Healthy"},{"InstanceId":"i-002","LifecycleState":"InService","HealthStatus":"Healthy"}]}]}
JSON
    ;;
  *'autoscaling describe-auto-scaling-instances'*)
    for argument in "$@"; do
      case "$argument" in i-*) instance_id=$argument ;; esac
    done
    state=InService
    if test "${FAKE_CHANGED_INSTANCE:-}" = "$instance_id"; then state=Terminating; fi
    printf '{"AutoScalingInstances":[{"InstanceId":"%s","AutoScalingGroupName":"skillomate-backend-asg","LifecycleState":"%s","HealthStatus":"HEALTHY"}]}\n' "$instance_id" "$state"
    ;;
  *'ec2 describe-instances'*)
    entries=""
    for argument in "$@"; do
      case "$argument" in
        i-001) entry='{"InstanceId":"i-001","State":{"Name":"running"},"PublicIpAddress":"198.51.100.11"}' ;;
        i-002)
          if test "${FAKE_PRIVATE_INSTANCE:-}" = i-002; then
            entry='{"InstanceId":"i-002","State":{"Name":"running"}}'
          else
            entry='{"InstanceId":"i-002","State":{"Name":"running"},"PublicIpAddress":"198.51.100.12"}'
          fi
          ;;
        i-003) entry='{"InstanceId":"i-003","State":{"Name":"running"},"PublicIpAddress":"198.51.100.13"}' ;;
        *) continue ;;
      esac
      if test -n "$entries"; then entries="$entries,$entry"; else entries="$entry"; fi
    done
    printf '{"Reservations":[{"Instances":[%s]}]}\n' "$entries"
    ;;
  *'elbv2 describe-target-groups'*)
    printf '%s\n' '{"TargetGroups":[{"TargetGroupName":"skillomate-backend-tg","TargetType":"instance","TargetGroupArn":"arn:aws:elasticloadbalancing:ap-south-1:123:targetgroup/skillomate-backend-tg/123"}]}'
    ;;
  *'elbv2 describe-target-health'*)
    state=healthy
    if test "${FAKE_UNHEALTHY_INSTANCE:-}" = i-002; then state=unhealthy; fi
    printf '{"TargetHealthDescriptions":[{"Target":{"Id":"i-001"},"TargetHealth":{"State":"healthy"}},{"Target":{"Id":"i-002"},"TargetHealth":{"State":"%s"}},{"Target":{"Id":"i-003"},"TargetHealth":{"State":"healthy"}}]}\n' "$state"
    ;;
  *) echo "Unexpected AWS call: $*" >&2; exit 91 ;;
esac
FAKE_AWS

cat >"$fake_ssh" <<'FAKE_SSH'
#!/usr/bin/env bash
set -Eeuo pipefail
host=""
command=""
for argument in "$@"; do
  case "$argument" in
    ubuntu@*) host="${argument#ubuntu@}" ;;
    true|*git\ -C*|bash\ -s*) command="$argument" ;;
  esac
done
printf '%s|%s\n' "$host" "$command" >>"$FAKE_SSH_CALLS"
if test "$command" = true && test "${FAKE_SSH_BLOCK_HOST:-}" = "$host"; then exit 255; fi
if [[ "$command" == *'rev-parse origin/main'* ]]; then
  printf '%s\n' "$FAKE_TARGET_COMMIT"
  exit 0
fi
if [[ "$command" == bash\ -s* ]]; then
  cat >/dev/null
  if test "${FAKE_FAIL_HOST:-}" = "$host"; then
    echo 'DEPLOYMENT FAILED'
    echo 'ROLLBACK SUCCESSFUL'
    exit 42
  fi
  echo 'DEPLOYMENT SUCCESS'
fi
FAKE_SSH
chmod 700 "$fake_remote_deployer" "$fake_aws" "$fake_ssh"

run_orchestrator() {
  local output_file=$1
  local name=$2
  shift 2
  env \
    FAKE_SSH_CALLS="$ssh_calls" \
    FAKE_AWS_CALLS="$aws_calls" \
    FAKE_TARGET_COMMIT="$TARGET_COMMIT" \
    SKILLOMATE_SSH_COMMAND="$fake_ssh" \
    SKILLOMATE_AWS_COMMAND="$fake_aws" \
    SKILLOMATE_SSH_KEY="$fake_key" \
    SKILLOMATE_REMOTE_DEPLOY_SCRIPT="$fake_remote_deployer" \
    SKILLOMATE_DEPLOY_LOG_DIRECTORY="$self_test_directory/$name-logs" \
    SKILLOMATE_DEPLOY_LOCK_DIRECTORY="$self_test_directory/$name.lock" \
    "$@" bash "$ORCHESTRATOR" >"$output_file" 2>&1
}

: >"$ssh_calls"
: >"$aws_calls"
success_output="$self_test_directory/success.out"
run_orchestrator "$success_output" success
grep -q '^ROLLING DEPLOYMENT COMPLETE$' "$success_output"
test "$(grep -c '^DEPLOY SUCCESS$' "$success_output")" -eq 3
test "$(find "$self_test_directory/success-logs" -type f -name '*.log' | wc -l | tr -d ' ')" -eq 3
test "$(grep 'bash -s' "$ssh_calls" | cut -d'|' -f1 | paste -sd, -)" = '198.51.100.11,198.51.100.12,198.51.100.13'
test "$(grep -c 'autoscaling describe-auto-scaling-instances' "$aws_calls")" -eq 3
if grep -Ev ' describe-' "$aws_calls" >/dev/null; then echo 'Unexpected AWS mutation' >&2; exit 1; fi

: >"$ssh_calls"
failure_output="$self_test_directory/failure.out"
set +e
run_orchestrator "$failure_output" failure FAKE_FAIL_HOST=198.51.100.12
failure_status=$?
set -e
test "$failure_status" -eq 42
grep -q '^DEPLOY FAILED$' "$failure_output"
! grep -q '198.51.100.13|bash -s' "$ssh_calls"

: >"$ssh_calls"
private_output="$self_test_directory/private.out"
set +e
run_orchestrator "$private_output" private FAKE_PRIVATE_INSTANCE=i-002
private_status=$?
set -e
test "$private_status" -eq 1
grep -q 'has no public IP address' "$private_output"
grep -q 'Instance Refresh' "$private_output"
test ! -s "$ssh_calls"

: >"$ssh_calls"
ssh_blocked_output="$self_test_directory/ssh-blocked.out"
set +e
run_orchestrator "$ssh_blocked_output" ssh-blocked FAKE_SSH_BLOCK_HOST=198.51.100.12
ssh_blocked_status=$?
set -e
test "$ssh_blocked_status" -eq 1
grep -q 'SSH preflight failed' "$ssh_blocked_output"
! grep -q 'bash -s' "$ssh_calls"

: >"$ssh_calls"
unhealthy_output="$self_test_directory/unhealthy.out"
set +e
run_orchestrator "$unhealthy_output" unhealthy FAKE_UNHEALTHY_INSTANCE=i-002
unhealthy_status=$?
set -e
test "$unhealthy_status" -eq 1
grep -q 'Target group preflight failed' "$unhealthy_output"
! grep -q 'bash -s' "$ssh_calls"

: >"$ssh_calls"
changed_output="$self_test_directory/changed.out"
set +e
run_orchestrator "$changed_output" changed FAKE_CHANGED_INSTANCE=i-002
changed_status=$?
set -e
test "$changed_status" -eq 1
grep -q 'ASG membership changed for i-002' "$changed_output"
! grep -q '198.51.100.12|bash -s' "$ssh_calls"

lock_directory="$self_test_directory/live.lock"
mkdir "$lock_directory"
sleep 60 &
live_lock_pid=$!
printf '%s\n' "$live_lock_pid" >"$lock_directory/pid"
: >"$ssh_calls"
lock_output="$self_test_directory/lock.out"
set +e
run_orchestrator "$lock_output" lock SKILLOMATE_DEPLOY_LOCK_DIRECTORY="$lock_directory"
lock_status=$?
set -e
test "$lock_status" -eq 75
grep -q 'Another Skillomate rolling deployment is already running' "$lock_output"
test ! -s "$ssh_calls"

: >"$ssh_calls"
missing_output="$self_test_directory/missing.out"
set +e
run_orchestrator "$missing_output" missing SKILLOMATE_LOCAL_REPOSITORY="$self_test_directory/no-bootstrap"
missing_status=$?
set -e
test "$missing_status" -eq 1
grep -q 'SSM bootstrap is missing' "$missing_output"
test ! -s "$ssh_calls"

old_deployer="$self_test_directory/old-deploy.sh"
printf '#!/usr/bin/env bash\nexit 0\n' >"$old_deployer"
: >"$ssh_calls"
old_output="$self_test_directory/old.out"
set +e
run_orchestrator "$old_output" old SKILLOMATE_REMOTE_DEPLOY_SCRIPT="$old_deployer"
old_status=$?
set -e
test "$old_status" -eq 1
grep -q 'does not declare the SSM production contract' "$old_output"
test ! -s "$ssh_calls"

echo 'ROLLING DEPLOYMENT SELF-TEST PASSED'
echo 'discovery=ASG InService and Healthy instances'
echo 'order=sorted instance IDs, sequential deployment'
echo 'private_or_unreachable=blocked_before_deployment'
echo 'failure_or_membership_change=stops_rollout'
