#!/usr/bin/env bash

set -Eeuo pipefail

readonly SCRIPT_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly ORCHESTRATOR="$SCRIPT_DIRECTORY/deploy-skillomate-production.sh"
readonly TARGET_COMMIT="0123456789abcdef0123456789abcdef01234567"

self_test_directory="$(mktemp -d /tmp/skillomate-rolling-deploy-selftest.XXXXXX)"

cleanup() {
  if test -n "${live_lock_pid:-}"; then
    kill "$live_lock_pid" 2>/dev/null || true
    wait "$live_lock_pid" 2>/dev/null || true
  fi
  rm -rf -- "$self_test_directory"
}

trap cleanup EXIT

fake_key="$self_test_directory/key.pem"
fake_remote_deployer="$self_test_directory/remote-deploy.sh"
fake_ssh="$self_test_directory/fake-ssh.sh"
calls_file="$self_test_directory/calls.log"

touch "$fake_key"
chmod 600 "$fake_key"
printf '#!/usr/bin/env bash\n# SKILLOMATE_SSM_DEPLOY_CONTRACT_V1\nexit 0\n' >"$fake_remote_deployer"
chmod 700 "$fake_remote_deployer"

cat >"$fake_ssh" <<'FAKE_SSH'
#!/usr/bin/env bash
set -Eeuo pipefail

host=""
command=""
for argument in "$@"; do
  case "$argument" in
    ubuntu@*) host="${argument#ubuntu@}" ;;
    *git\ -C*) command="$argument" ;;
    bash\ -s*) command="$argument" ;;
  esac
done

printf '%s|%s\n' "$host" "$command" >>"$FAKE_SSH_CALLS"

if [[ "$command" == *"rev-parse origin/main"* ]]; then
  printf '%s\n' "$FAKE_TARGET_COMMIT"
  exit 0
fi

cat >/dev/null
if test "${FAKE_FAIL_HOST:-}" = "$host"; then
  echo "DEPLOYMENT FAILED"
  echo "ROLLBACK SUCCESSFUL"
  exit 42
fi

echo "DEPLOYMENT SUCCESS"
FAKE_SSH
chmod 700 "$fake_ssh"

run_orchestrator() {
  local output_file=$1
  local log_directory=$2
  local lock_directory=$3
  shift 3

  env \
    FAKE_SSH_CALLS="$calls_file" \
    FAKE_TARGET_COMMIT="$TARGET_COMMIT" \
    SKILLOMATE_SSH_COMMAND="$fake_ssh" \
    SKILLOMATE_SSH_KEY="$fake_key" \
    SKILLOMATE_REMOTE_DEPLOY_SCRIPT="$fake_remote_deployer" \
    SKILLOMATE_DEPLOY_LOG_DIRECTORY="$log_directory" \
    SKILLOMATE_DEPLOY_LOCK_DIRECTORY="$lock_directory" \
    "$@" \
    bash "$ORCHESTRATOR" >"$output_file" 2>&1
}

success_output="$self_test_directory/success.out"
: >"$calls_file"
run_orchestrator \
  "$success_output" \
  "$self_test_directory/success-logs" \
  "$self_test_directory/success.lock"

grep -q '^=== EC2 #1 ===$' "$success_output"
grep -q '^=== EC2 #2 ===$' "$success_output"
grep -q '^=== EC2 #3 ===$' "$success_output"
grep -q '^ROLLING DEPLOYMENT COMPLETE$' "$success_output"
test "$(grep -c '^DEPLOY SUCCESS$' "$success_output")" -eq 3
test "$(find "$self_test_directory/success-logs" -type f -name '*.log' | wc -l | tr -d ' ')" -eq 3

deploy_hosts="$(grep 'bash -s' "$calls_file" | cut -d'|' -f1 | paste -sd, -)"
test "$deploy_hosts" = "13.235.104.167,3.108.8.89,13.201.21.124"

failure_output="$self_test_directory/failure.out"
: >"$calls_file"
set +e
run_orchestrator \
  "$failure_output" \
  "$self_test_directory/failure-logs" \
  "$self_test_directory/failure.lock" \
  FAKE_FAIL_HOST=3.108.8.89
failure_status=$?
set -e

test "$failure_status" -eq 42
grep -q '^ROLLBACK SUCCESSFUL$' "$failure_output"
grep -q '^DEPLOY FAILED$' "$failure_output"
if grep -q '13.201.21.124|bash -s' "$calls_file"; then
  echo "EC2 #3 was touched after EC2 #2 failed."
  exit 1
fi

lock_output="$self_test_directory/lock.out"
lock_directory="$self_test_directory/live.lock"
mkdir "$lock_directory"
sleep 60 &
live_lock_pid=$!
printf '%s\n' "$live_lock_pid" >"$lock_directory/pid"
: >"$calls_file"
set +e
run_orchestrator \
  "$lock_output" \
  "$self_test_directory/lock-logs" \
  "$lock_directory"
lock_status=$?
set -e

test "$lock_status" -eq 75
grep -q 'Another Skillomate rolling deployment is already running' "$lock_output"
test ! -s "$calls_file"

missing_bootstrap_output="$self_test_directory/missing-bootstrap.out"
: >"$calls_file"
set +e
run_orchestrator \
  "$missing_bootstrap_output" \
  "$self_test_directory/missing-bootstrap-logs" \
  "$self_test_directory/missing-bootstrap.lock" \
  SKILLOMATE_LOCAL_REPOSITORY="$self_test_directory/checkout-without-bootstrap"
missing_bootstrap_status=$?
set -e

test "$missing_bootstrap_status" -eq 1
grep -q 'SSM bootstrap is missing from the local repository' "$missing_bootstrap_output"
test ! -s "$calls_file"

old_deployer="$self_test_directory/old-remote-deploy.sh"
printf '#!/usr/bin/env bash\nexit 0\n' >"$old_deployer"
chmod 700 "$old_deployer"
old_deployer_output="$self_test_directory/old-deployer.out"
: >"$calls_file"
set +e
run_orchestrator \
  "$old_deployer_output" \
  "$self_test_directory/old-deployer-logs" \
  "$self_test_directory/old-deployer.lock" \
  SKILLOMATE_REMOTE_DEPLOY_SCRIPT="$old_deployer"
old_deployer_status=$?
set -e

test "$old_deployer_status" -eq 1
grep -q 'does not declare the SSM production contract' "$old_deployer_output"
test ! -s "$calls_file"

echo "ROLLING DEPLOYMENT SELF-TEST PASSED"
echo "success_order=EC2 #1,EC2 #2,EC2 #3"
echo "failure_stop=EC2 #2"
echo "concurrent_deployment_blocked=yes"
echo "missing_ssm_bootstrap_blocked=yes"
echo "old_remote_deployer_blocked=yes"
