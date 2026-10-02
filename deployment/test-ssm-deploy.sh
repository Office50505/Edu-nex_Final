#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_SCRIPT="$SCRIPT_DIRECTORY/deploy-skillomate.sh"
REAL_NODE="$(command -v node)"
self_test_directory="$(mktemp -d "${TMPDIR:-/tmp}/skillomate-ssm-deploy-test.XXXXXX")"
trap 'rm -rf -- "$self_test_directory"' EXIT

mkdir -p "$self_test_directory/backend" "$self_test_directory/frontend" \
  "$self_test_directory/marketing-web" "$self_test_directory/bin"
touch "$self_test_directory/backend/ssm-bootstrap.js" "$self_test_directory/backend/server.js"
touch "$self_test_directory/marketing-web/package.json" "$self_test_directory/marketing-web/package-lock.json"

export EXPECTED_BACKEND="$self_test_directory/backend"
export EXPECTED_FRONTEND="$self_test_directory/frontend"
export EXPECTED_MARKETING="$self_test_directory/marketing-web"
export SSM_SCRIPT="$EXPECTED_BACKEND/ssm-bootstrap.js"
export PROCESS_NAME=skillomate_backend
export READY_URL=http://127.0.0.1:3000/api/ready
export FAKE_PM2_STATE="$self_test_directory/pm2.json"
export FAKE_PM2_CALLS="$self_test_directory/pm2-calls.log"
export FAKE_SSM_CALLS="$self_test_directory/ssm-calls.log"
export REAL_NODE

for function_name in pm2_process_matches run_ssm_check start_or_restart_pm2_ssm install_frontend_build_dependencies wait_for_readiness; do
  awk -v function_name="$function_name" '
    $0 == function_name "() {" { copying = 1 }
    copying { print; if ($0 == "}") exit }
  ' "$DEPLOY_SCRIPT" >>"$self_test_directory/functions.sh"
done

source "$self_test_directory/functions.sh"

cat >"$self_test_directory/bin/node" <<'FAKE_NODE'
#!/usr/bin/env bash
set -Eeuo pipefail
if test "${1:-}" = ssm-bootstrap.js; then
  printf '%s|%s|%s\n' "$*" "${NODE_ENV:-missing}" "${SKILLOMATE_CONFIG_SOURCE:-missing}" >>"$FAKE_SSM_CALLS"
  if test "${FAKE_SSM_STATUS:-0}" -ne 0; then
    echo 'SSM CONFIG CHECK FAILURE'
    exit "$FAKE_SSM_STATUS"
  fi
  echo 'parameter count: 73'
  echo 'SSM CONFIG CHECK SUCCESS'
  exit 0
fi
exec "$REAL_NODE" "$@"
FAKE_NODE

cat >"$self_test_directory/bin/pm2" <<'FAKE_PM2'
#!/usr/bin/env bash
set -Eeuo pipefail
action=$1
shift
case "$action" in
  jlist) cat "$FAKE_PM2_STATE" ;;
  delete)
    printf 'delete|%s\n' "$*" >>"$FAKE_PM2_CALLS"
    printf '[]\n' >"$FAKE_PM2_STATE"
    ;;
  start)
    printf 'start|%s|%s|%s\n' "$*" "${NODE_ENV:-missing}" "${SKILLOMATE_CONFIG_SOURCE:-missing}" >>"$FAKE_PM2_CALLS"
    "$REAL_NODE" -e '
      const fs = require("fs");
      fs.writeFileSync(process.env.FAKE_PM2_STATE, JSON.stringify([{
        name: process.env.PROCESS_NAME,
        pm2_env: { pm_exec_path: process.argv[1], status: "online",
          NODE_ENV: process.env.NODE_ENV, SKILLOMATE_CONFIG_SOURCE: process.env.SKILLOMATE_CONFIG_SOURCE }
      }]));
    ' "$1"
    ;;
  restart)
    printf 'restart|%s|%s|%s\n' "$*" "${NODE_ENV:-missing}" "${SKILLOMATE_CONFIG_SOURCE:-missing}" >>"$FAKE_PM2_CALLS"
    "$REAL_NODE" -e '
      const fs = require("fs");
      const processes = JSON.parse(fs.readFileSync(process.env.FAKE_PM2_STATE, "utf8"));
      processes[0].pm2_env.status = "online";
      processes[0].pm2_env.NODE_ENV = process.env.NODE_ENV;
      processes[0].pm2_env.SKILLOMATE_CONFIG_SOURCE = process.env.SKILLOMATE_CONFIG_SOURCE;
      fs.writeFileSync(process.env.FAKE_PM2_STATE, JSON.stringify(processes));
    '
    ;;
  save)
    printf 'save|%s\n' "$*" >>"$FAKE_PM2_CALLS"
    ;;
  *) echo "Unexpected PM2 command: $action" >&2; exit 1 ;;
esac
FAKE_PM2

cat >"$self_test_directory/bin/curl" <<'FAKE_CURL'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s' "$FAKE_READY_BODY"
FAKE_CURL

cat >"$self_test_directory/bin/sleep" <<'FAKE_SLEEP'
#!/usr/bin/env bash
exit 0
FAKE_SLEEP

chmod 700 "$self_test_directory/bin/"*
export PATH="$self_test_directory/bin:$PATH"

: >"$FAKE_PM2_CALLS"
: >"$FAKE_SSM_CALLS"
run_ssm_check >"$self_test_directory/check.out"
grep -q '^SSM CONFIG CHECK SUCCESS$' "$self_test_directory/check.out"
grep -q '^ssm-bootstrap.js --check|production|ssm$' "$FAKE_SSM_CALLS"

export FAKE_SSM_STATUS=1
if run_ssm_check >"$self_test_directory/check-failed.out"; then
  echo 'Failed SSM check unexpectedly passed.' >&2
  exit 1
fi
test ! -s "$FAKE_PM2_CALLS"
unset FAKE_SSM_STATUS

"$REAL_NODE" -e '
  const fs = require("fs");
  fs.writeFileSync(process.env.FAKE_PM2_STATE, JSON.stringify([{
    name: process.env.PROCESS_NAME,
    pm2_env: { pm_exec_path: process.argv[1], status: "online",
      NODE_ENV: "production", SKILLOMATE_CONFIG_SOURCE: "ssm" }
  }]));
' "$EXPECTED_BACKEND/server.js"
start_or_restart_pm2_ssm
grep -q '^delete|skillomate_backend$' "$FAKE_PM2_CALLS"
grep -q "^start|$SSM_SCRIPT --name skillomate_backend --cwd $EXPECTED_BACKEND|production|ssm$" "$FAKE_PM2_CALLS"
pm2_process_matches runtime

: >"$FAKE_PM2_CALLS"
"$REAL_NODE" -e '
  const fs = require("fs");
  const processes = JSON.parse(fs.readFileSync(process.env.FAKE_PM2_STATE, "utf8"));
  processes[0].pm2_env.NODE_ENV = "development";
  processes[0].pm2_env.SKILLOMATE_CONFIG_SOURCE = "dotenv";
  fs.writeFileSync(process.env.FAKE_PM2_STATE, JSON.stringify(processes));
'
start_or_restart_pm2_ssm
grep -q '^restart|skillomate_backend --update-env|production|ssm$' "$FAKE_PM2_CALLS"
if grep -q '^delete|' "$FAKE_PM2_CALLS"; then
  echo 'SSM PM2 process was deleted instead of restarted.' >&2
  exit 1
fi
pm2_process_matches runtime

cp "$FAKE_PM2_STATE" "$self_test_directory/good-pm2.json"
printf 'invalid-json\n' >"$FAKE_PM2_STATE"
: >"$FAKE_PM2_CALLS"
if start_or_restart_pm2_ssm >"$self_test_directory/invalid-pm2.out"; then
  echo 'PM2 was changed despite an invalid process inventory.' >&2
  exit 1
fi
test ! -s "$FAKE_PM2_CALLS"
cp "$self_test_directory/good-pm2.json" "$FAKE_PM2_STATE"

export FAKE_READY_BODY='{"ok":true,"mongodb":"connected","redis":"connected"}'
test "$(wait_for_readiness)" = 'mongodb=connected redis=connected'
export FAKE_READY_BODY='{"ok":true,"mongodb":"connected","redis":"disconnected"}'
if wait_for_readiness >/dev/null; then
  echo 'Readiness accepted disconnected Redis.' >&2
  exit 1
fi

# Exercise the pre-restart failure path in isolation: it may restore files,
# but it must not invoke SSM again, restart PM2, or save PM2.
awk '
  $0 == "rollback_deployment() {" { copying = 1 }
  copying { print; if ($0 == "}") exit }
' "$DEPLOY_SCRIPT" >>"$self_test_directory/functions.sh"
source "$self_test_directory/functions.sh"
mkdir -p "$self_test_directory/repository" "$self_test_directory/frontend" "$self_test_directory/marketing-web"
REPOSITORY="$self_test_directory/repository"
EXPECTED_FRONTEND="$self_test_directory/frontend"
EXPECTED_MARKETING="$self_test_directory/marketing-web"
OLD_COMMIT=0123456789abcdef0123456789abcdef01234567
FAKE_READY_BODY='{"ok":true,"mongodb":"connected","redis":"connected"}'
record_result() { printf '%s|%s\n' "$1" "$2" >>"$self_test_directory/rollback-records.log"; }
wait_for_health() { printf '%s' healthy; }
check_courses() { printf '%s' 'valid_json=yes top_level_type=list item_count=0'; }

cat >"$self_test_directory/bin/git" <<'FAKE_GIT'
#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "$*" == *'rev-parse HEAD'* ]]; then printf '%s\n' "$OLD_COMMIT"; fi
FAKE_GIT
cat >"$self_test_directory/bin/npm" <<'FAKE_NPM'
#!/usr/bin/env bash
set -Eeuo pipefail
if test -n "${FAKE_NPM_CALLS:-}"; then
  printf '%s|%s\n' "$PWD" "$*" >>"$FAKE_NPM_CALLS"
fi
exit 0
FAKE_NPM
cat >"$self_test_directory/bin/ss" <<'FAKE_SS'
#!/usr/bin/env bash
echo 'LISTEN 0 511 127.0.0.1:3000'
FAKE_SS
chmod 700 "$self_test_directory/bin/git" "$self_test_directory/bin/npm" "$self_test_directory/bin/ss"
export OLD_COMMIT FAKE_READY_BODY FAKE_NPM_CALLS="$self_test_directory/npm-calls.log"
: >"$FAKE_PM2_CALLS"
: >"$FAKE_SSM_CALLS"
set +e
(rollback_deployment 'SSM check failed before PM2 restart' no) >"$self_test_directory/no-restart-rollback.out" 2>&1
rollback_status=$?
set -e
test "$rollback_status" -eq 1
grep -q '^ROLLBACK SUCCESSFUL$' "$self_test_directory/no-restart-rollback.out"
test ! -s "$FAKE_PM2_CALLS"
test ! -s "$FAKE_SSM_CALLS"

: >"$FAKE_PM2_CALLS"
: >"$FAKE_SSM_CALLS"
set +e
(rollback_deployment 'simulated post-restart failure') >"$self_test_directory/restart-rollback.out" 2>&1
restart_rollback_status=$?
set -e
test "$restart_rollback_status" -eq 1
grep -q '^ROLLBACK SUCCESSFUL$' "$self_test_directory/restart-rollback.out"
grep -q '^ssm-bootstrap.js --check|production|ssm$' "$FAKE_SSM_CALLS"
grep -q '^restart|skillomate_backend --update-env|production|ssm$' "$FAKE_PM2_CALLS"
grep -q '^save|$' "$FAKE_PM2_CALLS"
test "$(cut -d'|' -f1 "$FAKE_PM2_CALLS" | paste -sd, -)" = 'restart,save'

python3 - "$DEPLOY_SCRIPT" <<'PY'
from pathlib import Path
import sys
source = Path(sys.argv[1]).read_text()
assert 'Current commit lacks the tracked SSM bootstrap needed for an SSM rollback.' in source
target = source[source.rfind('if ! npm ci --omit=dev --no-audit --no-fund; then'):]
assert target.index('if ! run_ssm_check; then') < target.index('if ! start_or_restart_pm2_ssm; then')
assert 'rollback_deployment "SSM check failed before PM2 restart" no' in target
assert 'install_frontend_build_dependencies' in source
assert target.index('if ! pm2_process_matches runtime; then') < target.index('if ! pm2 save; then')
assert target.index('if test "$CURRENT_COMMIT" != "$NEW_COMMIT"; then') < target.index('if ! pm2 save; then')
no_op = source[source.index('if test "$OLD_COMMIT" = "$NEW_COMMIT"; then'):source.index('DEPLOYMENT_STARTED=1\n\nif ! git checkout main; then')]
assert no_op.index('if ! run_ssm_check; then') < no_op.index('if ! start_or_restart_pm2_ssm; then')
rollback = source[source.index('rollback_deployment() {'):source.index('on_unexpected_error() {')]
assert 'if test "$restart_backend" = yes; then' in rollback
assert 'if run_ssm_check; then' in rollback
PY

echo 'SSM DEPLOYMENT SELF-TEST PASSED'
echo 'ssm_precheck=before_restart'
echo 'pm2_replacement_and_restart=explicit_production_ssm_environment'
echo 'readiness=mongodb_and_redis_connected'
echo 'failed_ssm_check=rollback_without_backend_restart'
echo 'post_restart_failure=ssm_checked_rollback_then_save'
