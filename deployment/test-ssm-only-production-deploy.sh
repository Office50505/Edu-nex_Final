#!/usr/bin/env bash
# Run the production deployer against temporary paths and fake commands only.
set -Eeuo pipefail

SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_SCRIPT="$SCRIPT_DIRECTORY/deploy-skillomate.sh"
SERVER_SCRIPT="$SCRIPT_DIRECTORY/../edunex-b/server.js"
REAL_NODE="$(command -v node)"
self_test_directory="$(mktemp -d "${TMPDIR:-/tmp}/skillomate-ssm-only.XXXXXX")"
trap 'rm -rf -- "$self_test_directory"' EXIT

repository="$self_test_directory/repository"
backend="$repository/edunex-b"
frontend="$repository/edunex-f"
marketing="$repository/marketing-web"
mkdir -p "$backend" "$frontend" "$marketing" "$self_test_directory/bin" "$self_test_directory/logs"
touch "$backend/ssm-bootstrap.js" "$backend/package-lock.json" "$frontend/package-lock.json" \
  "$marketing/package.json" "$marketing/package-lock.json"
backend_pwd="$(cd "$backend" && pwd)"
frontend_pwd="$(cd "$frontend" && pwd)"
marketing_pwd="$(cd "$marketing" && pwd)"
ln -s "$backend" "$self_test_directory/active-backend"
test ! -e "$backend/.env"

python3 - "$DEPLOY_SCRIPT" "$self_test_directory/deploy.sh" "$self_test_directory" <<'PY'
from pathlib import Path
import sys

source, target, root = sys.argv[1:]
text = Path(source).read_text()
text = text.replace('/home/ubuntu/skillomate_backend', f'{root}/active-backend')
text = text.replace('/home/ubuntu/skillomate_repo', f'{root}/repository')
text = text.replace('/home/ubuntu/skillomate_deployments', f'{root}/logs')
text = text.replace('/tmp/skillomate-deploy.lock', f'{root}/deploy.lock')
Path(target).write_text(text)
PY

cat >"$self_test_directory/bin/git" <<'FAKE_GIT'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >>"$FAKE_GIT_CALLS"
case "$*" in
  *'rev-parse --show-toplevel'*) printf '%s\n' "$FAKE_REPOSITORY" ;;
  *'remote get-url origin'*) printf '%s\n' 'git@github-skillomate:Office50505/Edu-nex_Final.git' ;;
  *'branch --show-current'*) printf '%s\n' main ;;
  *'ls-files --error-unmatch edunex-b/.env'*)
    if test "${FAKE_TRACKED_CONFIG:-}" = current; then exit 0; fi
    exit 1
    ;;
  *'cat-file -e '*'edunex-b/.env'*)
    if test "${FAKE_TRACKED_CONFIG:-}" = target; then exit 0; fi
    exit 1
    ;;
  *'diff --quiet'*|*'diff --cached --quiet'*|*'fetch --prune origin main'*|*'checkout main'*|*'ls-files --error-unmatch '*|*'status --short'*) : ;;
  *'ls-files --others --exclude-standard'*) : ;;
  *'rev-parse origin/main'*) printf '%s\n' "$FAKE_NEW_COMMIT" ;;
  *'rev-parse HEAD'*) cat "$FAKE_GIT_HEAD" ;;
  *'reset --hard '*) printf '%s\n' "${*: -1}" >"$FAKE_GIT_HEAD" ;;
  *'log -1 --format=%s'*) printf '%s\n' 'local candidate' ;;
  *) echo "Unexpected Git command: $*" >&2; exit 90 ;;
esac
FAKE_GIT

cat >"$self_test_directory/bin/node" <<'FAKE_NODE'
#!/usr/bin/env bash
set -Eeuo pipefail
if test "${1:-}" = ssm-bootstrap.js && test "${2:-}" = --check; then
  printf 'ssm|%s|%s\n' "${NODE_ENV:-missing}" "${SKILLOMATE_CONFIG_SOURCE:-missing}" >>"$FAKE_EVENTS"
  if test "${FAKE_SSM_FAILURE:-}" = always || {
    test "${FAKE_SSM_FAILURE:-}" = after-reset &&
    test "$(cat "$FAKE_GIT_HEAD")" = "$FAKE_NEW_COMMIT";
  } || {
    test "${FAKE_SSM_FAILURE:-}" = old-only &&
    test "$(cat "$FAKE_GIT_HEAD")" != "$FAKE_NEW_COMMIT";
  }; then
    echo 'SSM CONFIG CHECK FAILURE'
    exit 1
  fi
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
    printf 'pm2-start|%s|%s\n' "${NODE_ENV:-missing}" "${SKILLOMATE_CONFIG_SOURCE:-missing}" >>"$FAKE_EVENTS"
    "$REAL_NODE" -e '
      const fs = require("fs");
      fs.writeFileSync(process.env.FAKE_PM2_STATE, JSON.stringify([{
        name: "skillomate_backend", pm2_env: { pm_exec_path: process.argv[1],
          status: "online", NODE_ENV: process.env.NODE_ENV,
          SKILLOMATE_CONFIG_SOURCE: process.env.SKILLOMATE_CONFIG_SOURCE }
      }]));
    ' "$1"
    ;;
  restart)
    printf 'restart|%s|%s|%s\n' "$*" "${NODE_ENV:-missing}" "${SKILLOMATE_CONFIG_SOURCE:-missing}" >>"$FAKE_PM2_CALLS"
    printf 'pm2-restart|%s|%s\n' "${NODE_ENV:-missing}" "${SKILLOMATE_CONFIG_SOURCE:-missing}" >>"$FAKE_EVENTS"
    "$REAL_NODE" -e '
      const fs = require("fs");
      const state = JSON.parse(fs.readFileSync(process.env.FAKE_PM2_STATE, "utf8"));
      state[0].pm2_env.status = "online";
      state[0].pm2_env.NODE_ENV = process.env.NODE_ENV;
      state[0].pm2_env.SKILLOMATE_CONFIG_SOURCE = process.env.SKILLOMATE_CONFIG_SOURCE;
      fs.writeFileSync(process.env.FAKE_PM2_STATE, JSON.stringify(state));
    '
    ;;
  save) printf 'save|%s\n' "$*" >>"$FAKE_PM2_CALLS" ;;
  status) : ;;
  *) echo "Unexpected PM2 command: $action" >&2; exit 91 ;;
esac
FAKE_PM2

cat >"$self_test_directory/bin/curl" <<'FAKE_CURL'
#!/usr/bin/env bash
set -Eeuo pipefail
case "$*" in
  *'/api/health'*) printf '%s' '{"ok":true}' ;;
  *'/api/ready'*)
    if test "${FAKE_READY_FAILURE:-}" = on-new && test "$(cat "$FAKE_GIT_HEAD")" = "$FAKE_NEW_COMMIT"; then
      printf '%s' '{"ok":false,"mongodb":"connected","redis":"disconnected"}'
    else
      printf '%s' '{"ok":true,"mongodb":"connected","redis":"connected"}'
    fi
    ;;
  *'/api/courses'*) printf '%s' '[]' ;;
  *) echo "Unexpected curl command: $*" >&2; exit 92 ;;
esac
FAKE_CURL

cat >"$self_test_directory/bin/npm" <<'FAKE_NPM'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s|%s\n' "$PWD" "$*" >>"$FAKE_NPM_CALLS"
FAKE_NPM
cat >"$self_test_directory/bin/ss" <<'FAKE_SS'
#!/usr/bin/env bash
printf '%s\n' 'LISTEN 0 511 127.0.0.1:3000'
FAKE_SS
cat >"$self_test_directory/bin/flock" <<'FAKE_FLOCK'
#!/usr/bin/env bash
exit 0
FAKE_FLOCK
cat >"$self_test_directory/bin/readlink" <<'FAKE_READLINK'
#!/usr/bin/env bash
printf '%s\n' "$FAKE_BACKEND"
FAKE_READLINK
cat >"$self_test_directory/bin/sleep" <<'FAKE_SLEEP'
#!/usr/bin/env bash
exit 0
FAKE_SLEEP
chmod 700 "$self_test_directory/bin/"*

export PATH="$self_test_directory/bin:$PATH"
export REAL_NODE
export FAKE_REPOSITORY="$repository"
export FAKE_BACKEND="$backend"
export FAKE_GIT_HEAD="$self_test_directory/head"
export FAKE_NEW_COMMIT=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
export FAKE_GIT_CALLS="$self_test_directory/git-calls"
export FAKE_PM2_STATE="$self_test_directory/pm2.json"
export FAKE_PM2_CALLS="$self_test_directory/pm2-calls"
export FAKE_NPM_CALLS="$self_test_directory/npm-calls"
export FAKE_EVENTS="$self_test_directory/events"
old_commit=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

reset_case() {
  printf '%s\n' "$old_commit" >"$FAKE_GIT_HEAD"
  printf '[]\n' >"$FAKE_PM2_STATE"
  : >"$FAKE_GIT_CALLS"
  : >"$FAKE_PM2_CALLS"
  : >"$FAKE_NPM_CALLS"
  : >"$FAKE_EVENTS"
  test ! -e "$backend/.env"
}

run_deploy() {
  env NODE_ENV=development SKILLOMATE_CONFIG_SOURCE=dotenv \
    "$@" bash "$self_test_directory/deploy.sh" "$FAKE_NEW_COMMIT"
}

reset_case
run_deploy >"$self_test_directory/success.out" 2>&1
grep -q '^DEPLOYMENT SUCCESS$' "$self_test_directory/success.out"
test "$(cat "$FAKE_GIT_HEAD")" = "$FAKE_NEW_COMMIT"
test "$(grep -c '^ssm|production|ssm$' "$FAKE_EVENTS")" -eq 2
grep -q "^$frontend_pwd|ci --no-audit --no-fund$" "$FAKE_NPM_CALLS"
grep -q "^$marketing_pwd|ci --no-audit --no-fund$" "$FAKE_NPM_CALLS"
grep -q "^$frontend_pwd|run build$" "$FAKE_NPM_CALLS"
grep -q "^$backend_pwd|ci --omit=dev --no-audit --no-fund$" "$FAKE_NPM_CALLS"
test "$(cut -d'|' -f1,2 "$FAKE_NPM_CALLS" | paste -sd, -)" = "$frontend_pwd|ci --no-audit --no-fund,$marketing_pwd|ci --no-audit --no-fund,$frontend_pwd|run build,$backend_pwd|ci --omit=dev --no-audit --no-fund"
grep -q "^start|$backend/ssm-bootstrap.js --name skillomate_backend --cwd $backend|production|ssm$" "$FAKE_PM2_CALLS"
"$REAL_NODE" -e '
  const fs = require("fs");
  const p = JSON.parse(fs.readFileSync(process.env.FAKE_PM2_STATE))[0];
  if (p.pm2_env.status !== "online" || p.pm2_env.NODE_ENV !== "production"
      || p.pm2_env.SKILLOMATE_CONFIG_SOURCE !== "ssm"
      || p.pm2_env.pm_exec_path !== process.env.FAKE_BACKEND + "/ssm-bootstrap.js") process.exit(1);
'
test "$(cut -d'|' -f1 "$FAKE_EVENTS" | paste -sd, -)" = 'ssm,ssm,pm2-start'
test ! -e "$backend/.env"

reset_case
run_deploy FAKE_SSM_FAILURE=old-only >"$self_test_directory/target-bootstrap-success.out" 2>&1
grep -q '^DEPLOYMENT SUCCESS$' "$self_test_directory/target-bootstrap-success.out"
test "$(cat "$FAKE_GIT_HEAD")" = "$FAKE_NEW_COMMIT"
test "$(grep -c '^ssm|production|ssm$' "$FAKE_EVENTS")" -eq 2
test "$(cut -d'|' -f1 "$FAKE_EVENTS" | paste -sd, -)" = 'ssm,ssm,pm2-start'
test ! -e "$backend/.env"

reset_case
"$REAL_NODE" -e '
  const fs = require("fs");
  fs.writeFileSync(process.env.FAKE_PM2_STATE, JSON.stringify([{
    name: "skillomate_backend", pm2_env: { pm_exec_path: process.env.FAKE_BACKEND + "/ssm-bootstrap.js",
      status: "online", NODE_ENV: "production", SKILLOMATE_CONFIG_SOURCE: "ssm" }
  }]));
'
set +e
run_deploy FAKE_SSM_FAILURE=always >"$self_test_directory/target-ssm-failure.out" 2>&1
target_ssm_status=$?
set -e
test "$target_ssm_status" -eq 1
grep -q 'target SSM check failed before dependency install or PM2 restart' "$self_test_directory/target-ssm-failure.out"
grep -q '^ROLLBACK SUCCESSFUL$' "$self_test_directory/target-ssm-failure.out"
test "$(cat "$FAKE_GIT_HEAD")" = "$old_commit"
test ! -s "$FAKE_PM2_CALLS"
test "$(grep -c '^ssm|production|ssm$' "$FAKE_EVENTS")" -eq 1
grep -q "reset --hard $FAKE_NEW_COMMIT" "$FAKE_GIT_CALLS"
grep -q "reset --hard $old_commit" "$FAKE_GIT_CALLS"
test ! -e "$backend/.env"

reset_case
"$REAL_NODE" -e '
  const fs = require("fs");
  fs.writeFileSync(process.env.FAKE_PM2_STATE, JSON.stringify([{
    name: "skillomate_backend", pm2_env: { pm_exec_path: process.env.FAKE_BACKEND + "/ssm-bootstrap.js",
      status: "online", NODE_ENV: "production", SKILLOMATE_CONFIG_SOURCE: "ssm" }
  }]));
'
set +e
run_deploy FAKE_SSM_FAILURE=after-reset >"$self_test_directory/post-reset-failure.out" 2>&1
post_reset_status=$?
set -e
if test "$post_reset_status" -ne 1; then
  cat "$self_test_directory/post-reset-failure.out" >&2
  exit 1
fi
grep -q '^ROLLBACK SUCCESSFUL$' "$self_test_directory/post-reset-failure.out"
test "$(cat "$FAKE_GIT_HEAD")" = "$old_commit"
test ! -s "$FAKE_PM2_CALLS"
test "$(grep -c '^ssm|production|ssm$' "$FAKE_EVENTS")" -eq 1
test ! -e "$backend/.env"

reset_case
set +e
run_deploy FAKE_READY_FAILURE=on-new >"$self_test_directory/rollback.out" 2>&1
rollback_status=$?
set -e
test "$rollback_status" -eq 1
grep -q '^ROLLBACK SUCCESSFUL$' "$self_test_directory/rollback.out"
test "$(cat "$FAKE_GIT_HEAD")" = "$old_commit"
grep -q '^restart|skillomate_backend --update-env|production|ssm$' "$FAKE_PM2_CALLS"
if test "$(grep -c '^ssm|production|ssm$' "$FAKE_EVENTS")" -ne 3; then
  cat "$FAKE_EVENTS" "$self_test_directory/rollback.out" >&2
  exit 1
fi
test ! -e "$backend/.env"

reset_case
set +e
run_deploy FAKE_TRACKED_CONFIG=current >"$self_test_directory/tracked-current.out" 2>&1
tracked_current_status=$?
set -e
test "$tracked_current_status" -eq 17
test "$(cat "$FAKE_GIT_HEAD")" = "$old_commit"
test ! -s "$FAKE_PM2_CALLS"
test ! -e "$backend/.env"

reset_case
set +e
run_deploy FAKE_TRACKED_CONFIG=target >"$self_test_directory/tracked-target.out" 2>&1
tracked_target_status=$?
set -e
test "$tracked_target_status" -eq 32
test "$(cat "$FAKE_GIT_HEAD")" = "$old_commit"
test ! -s "$FAKE_PM2_CALLS"
test ! -e "$backend/.env"

"$REAL_NODE" - "$SERVER_SCRIPT" <<'JS'
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(process.argv[2], 'utf8').split("const helmet = require('helmet');")[0];
const dotenvCalls = [];
vm.runInNewContext(source, {
  process: { env: { NODE_ENV: 'production', SKILLOMATE_CONFIG_SOURCE: 'ssm' }, exit: () => { throw Error('unexpected exit'); } },
  globalThis: { [Symbol.for('skillomate.ssm.bootstrap')]: true },
  Symbol,
  __dirname: '/temporary/backend',
  require: (name) => name === 'dotenv' ? { config: (options) => dotenvCalls.push(options) }
    : name === 'path' ? require('path') : {},
});
if (dotenvCalls.length !== 0) throw Error('SSM production loaded dotenv');
JS

echo 'SSM-ONLY PRODUCTION DEPLOYMENT SELF-TEST PASSED'
echo 'missing_env=deployment_success'
echo 'target_bootstrap=used_for_ssm_validation'
echo 'target_ssm_failure=old_checkout_restored_without_pm2_restart'
echo 'post_reset_ssm_failure=rollback_without_pm2_restart'
echo 'post_restart_failure=ssm_checked_rollback'
echo 'tracked_config_commits=blocked_before_change'
echo 'marketing_web_dependencies=installed_before_frontend_build'
echo 'ssm_server_startup=dotenv_not_loaded'
