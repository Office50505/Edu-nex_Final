#!/usr/bin/env bash
# SKILLOMATE_SSM_DEPLOY_CONTRACT_V1

set -Eeuo pipefail

readonly ACTIVE_BACKEND="/home/ubuntu/skillomate_backend"
readonly REPOSITORY="/home/ubuntu/skillomate_repo"
readonly EXPECTED_BACKEND="/home/ubuntu/skillomate_repo/edunex-b"
readonly EXPECTED_FRONTEND="/home/ubuntu/skillomate_repo/edunex-f"
readonly EXPECTED_ORIGIN="git@github-skillomate:Office50505/Edu-nex_Final.git"
readonly PROCESS_NAME="skillomate_backend"
readonly SSM_SCRIPT="$EXPECTED_BACKEND/ssm-bootstrap.js"
readonly HEALTH_URL="http://127.0.0.1:3000/api/health"
readonly READY_URL="http://127.0.0.1:3000/api/ready"
readonly COURSES_URL="http://127.0.0.1:3000/api/courses"
readonly LOCK_FILE="/tmp/skillomate-deploy.lock"
readonly LOG_DIRECTORY="/home/ubuntu/skillomate_deployments"

umask 077
mkdir -p "$LOG_DIRECTORY"
chmod 700 "$LOG_DIRECTORY"

DEPLOYMENT_TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$LOG_DIRECTORY/deploy-$DEPLOYMENT_TIMESTAMP.log"
touch "$LOG_FILE"
chmod 600 "$LOG_FILE"

OLD_COMMIT=""
NEW_COMMIT=""
HEALTH_RESULT=""
READINESS_RESULT=""
COURSES_RESULT=""
DEPLOYMENT_STARTED=0
EXPECTED_TARGET_COMMIT="${1:-}"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another Skillomate deployment is already running."
  exit 75
fi

record_result() {
  local result=$1
  local rollback_result=${2:-not-required}
  {
    printf 'timestamp=%s\n' "$DEPLOYMENT_TIMESTAMP"
    printf 'old_commit=%s\n' "${OLD_COMMIT:-unknown}"
    printf 'new_commit=%s\n' "${NEW_COMMIT:-unknown}"
    printf 'result=%s\n' "$result"
    printf 'rollback=%s\n' "$rollback_result"
  } >>"$LOG_FILE"
}

pm2_process_matches() {
  local mode=$1
  pm2 jlist | node -e '
    const fs = require("fs");
    const mode = process.argv[1];
    const expectedScript = process.argv[2];
    const processName = process.argv[3];
    let processes;
    try { processes = JSON.parse(fs.readFileSync(0, "utf8")); }
    catch { process.exit(1); }
    if (!Array.isArray(processes)) process.exit(1);
    const backend = processes.find((item) => item.name === processName);
    if (mode === "exists") process.exit(backend ? 0 : 1);
    if (mode === "missing") process.exit(backend ? 1 : 0);
    if (!backend) process.exit(1);
    const details = backend.pm2_env || {};
    const script = details.pm_exec_path || backend.pm_exec_path;
    let scriptMatches = false;
    try { scriptMatches = fs.realpathSync(script) === fs.realpathSync(expectedScript); }
    catch { /* Missing or invalid script path is a failed check. */ }
    if (mode === "script") process.exit(scriptMatches ? 0 : 1);
    const nodeEnv = details.NODE_ENV ?? details.env?.NODE_ENV;
    const configSource = details.SKILLOMATE_CONFIG_SOURCE ?? details.env?.SKILLOMATE_CONFIG_SOURCE;
    process.exit(scriptMatches && details.status === "online"
      && nodeEnv === "production" && configSource === "ssm" ? 0 : 1);
  ' "$mode" "$SSM_SCRIPT" "$PROCESS_NAME"
}

run_ssm_check() {
  test -f "$SSM_SCRIPT" || return 1
  (cd "$EXPECTED_BACKEND" && env NODE_ENV=production SKILLOMATE_CONFIG_SOURCE=ssm node ssm-bootstrap.js --check)
}

start_or_restart_pm2_ssm() {
  if pm2_process_matches script; then
    env NODE_ENV=production SKILLOMATE_CONFIG_SOURCE=ssm pm2 restart "$PROCESS_NAME" --update-env
    return
  fi

  if pm2_process_matches exists; then
    pm2 delete "$PROCESS_NAME" || return 1
  elif ! pm2_process_matches missing; then
    echo "PM2 process inventory could not be verified; backend was not changed."
    return 1
  fi
  env NODE_ENV=production SKILLOMATE_CONFIG_SOURCE=ssm \
    pm2 start "$SSM_SCRIPT" --name "$PROCESS_NAME" --cwd "$EXPECTED_BACKEND"
}

wait_for_health() {
  local body
  local attempt

  for attempt in $(seq 1 15); do
    if body=$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null); then
      printf '%s' "$body"
      return 0
    fi
    sleep 2
  done

  return 1
}

wait_for_readiness() {
  local body
  local attempt

  for attempt in $(seq 1 15); do
    if body=$(curl -fsS --max-time 5 "$READY_URL" 2>/dev/null); then
      if printf '%s' "$body" | node -e '
        let payload;
        try { payload = JSON.parse(require("fs").readFileSync(0, "utf8")); }
        catch { process.exit(1); }
        process.exit(payload?.ok === true && payload.mongodb === "connected"
          && payload.redis === "connected" ? 0 : 1);
      '; then
        printf '%s' 'mongodb=connected redis=connected'
        return 0
      fi
    fi
    sleep 2
  done

  return 1
}

check_courses() {
  curl -fsS --max-time 15 "$COURSES_URL" | python3 -c '
import json
import sys

payload = json.load(sys.stdin)
if not isinstance(payload, list):
    raise SystemExit(f"unexpected top-level type: {type(payload).__name__}")
print(f"valid_json=yes top_level_type=list item_count={len(payload)}")
'
}

show_safe_diagnostics() {
  echo "current_commit=$(git -C "$REPOSITORY" rev-parse HEAD 2>/dev/null || echo unknown)"
  pm2 status || true
  echo "Recent deployment diagnostics:"
  tail -n 20 "$LOG_FILE" || true
}

rollback_deployment() {
  local reason=$1
  local restart_backend=${2:-yes}
  local rollback_ok=1
  local rollback_health="unavailable"
  local rollback_readiness="unavailable"
  local rollback_courses="unavailable"

  trap - ERR
  set +e
  echo "Deployment failed: $reason"
  echo "Rolling production back to $OLD_COMMIT"

  cd "$REPOSITORY" || rollback_ok=0
  git reset --hard "$OLD_COMMIT" || rollback_ok=0
  cd "$EXPECTED_FRONTEND" || rollback_ok=0
  npm ci --no-audit --no-fund || rollback_ok=0
  npm run build || rollback_ok=0
  cd "$EXPECTED_BACKEND" || rollback_ok=0
  npm ci --omit=dev --no-audit --no-fund || rollback_ok=0
  if test "$restart_backend" = yes; then
    if run_ssm_check; then
      start_or_restart_pm2_ssm || rollback_ok=0
    else
      echo "Rollback SSM check failed; backend was not restarted."
      rollback_ok=0
    fi
  fi
  rollback_health=$(wait_for_health) || rollback_ok=0
  rollback_readiness=$(wait_for_readiness) || rollback_ok=0
  rollback_courses=$(check_courses 2>/dev/null) || rollback_ok=0
  pm2_process_matches runtime || rollback_ok=0
  ss -ltnp | grep -q ':3000' || rollback_ok=0
  test "$(git -C "$REPOSITORY" rev-parse HEAD)" = "$OLD_COMMIT" || rollback_ok=0
  if test "$rollback_ok" -eq 1 && test "$restart_backend" = yes; then
    pm2 save || rollback_ok=0
  fi

  if test "$rollback_ok" -eq 1; then
    record_result failed successful
    echo "DEPLOYMENT FAILED"
    echo "ROLLBACK SUCCESSFUL"
    echo "PRODUCTION RESTORED TO $OLD_COMMIT"
    echo "health=$rollback_health"
    echo "ready=$rollback_readiness"
    echo "courses=$rollback_courses"
    exit 1
  fi

  record_result failed failed
  echo "CRITICAL:"
  echo "DEPLOYMENT FAILED AND AUTOMATIC ROLLBACK FAILED"
  show_safe_diagnostics
  exit 2
}

on_unexpected_error() {
  local failure_code=$?
  local failure_line=$LINENO

  if test "$DEPLOYMENT_STARTED" -eq 1 && test -n "$OLD_COMMIT"; then
    rollback_deployment "unexpected error at script line $failure_line (status $failure_code)"
  fi

  trap - ERR
  record_result preflight-failed not-started
  echo "Deployment stopped before changing production (status $failure_code, line $failure_line)."
  exit "$failure_code"
}

trap on_unexpected_error ERR

if test ! -L "$ACTIVE_BACKEND"; then
  echo "$ACTIVE_BACKEND must be the production symlink."
  exit 10
fi

if test "$(readlink -f "$ACTIVE_BACKEND")" != "$EXPECTED_BACKEND"; then
  echo "$ACTIVE_BACKEND points to an unexpected target."
  exit 11
fi

cd "$ACTIVE_BACKEND"

if test "$(git rev-parse --show-toplevel)" != "$REPOSITORY"; then
  echo "Production is not inside the expected Git repository."
  exit 12
fi

if test "$(git remote get-url origin)" != "$EXPECTED_ORIGIN"; then
  echo "Git origin does not match the approved read-only repository."
  exit 13
fi

if test "$(git branch --show-current)" != "main"; then
  echo "Production is not on branch main."
  exit 14
fi

for config_file in edunex-b/.env edunex-b/.env.local; do
  if git -C "$REPOSITORY" ls-files --error-unmatch "$config_file" >/dev/null 2>&1; then
    echo "Production Git commit tracks a local configuration file."
    exit 17
  fi
done

if test ! -f package-lock.json; then
  echo "package-lock.json is missing."
  exit 18
fi

if test ! -f "$EXPECTED_FRONTEND/package-lock.json"; then
  echo "Frontend package-lock.json is missing."
  exit 24
fi

if ! git -C "$REPOSITORY" ls-files --error-unmatch edunex-f/package-lock.json >/dev/null 2>&1; then
  echo "Frontend package-lock.json is not tracked."
  exit 25
fi

if ! git ls-files --error-unmatch package-lock.json >/dev/null 2>&1; then
  echo "package-lock.json is not tracked by Git."
  exit 19
fi

if test ! -f "$SSM_SCRIPT" || ! git -C "$REPOSITORY" ls-files --error-unmatch edunex-b/ssm-bootstrap.js >/dev/null 2>&1; then
  echo "Current commit lacks the tracked SSM bootstrap needed for an SSM rollback."
  exit 31
fi

if test -n "$EXPECTED_TARGET_COMMIT" && [[ ! "$EXPECTED_TARGET_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Expected deployment commit must be a full lowercase Git SHA."
  exit 26
fi

if ! git diff --quiet || ! git diff --cached --quiet || test -n "$(git ls-files --others --exclude-standard)"; then
  echo "Production contains unexpected manual changes. Deployment stopped."
  git status --short
  exit 20
fi

OLD_COMMIT="$(git rev-parse HEAD)"

git fetch --prune origin main
NEW_COMMIT="$(git rev-parse origin/main)"

for config_file in edunex-b/.env edunex-b/.env.local; do
  if git -C "$REPOSITORY" cat-file -e "$NEW_COMMIT:$config_file" >/dev/null 2>&1; then
    record_result preflight-failed tracked-config
    echo "Target Git commit tracks a local configuration file."
    exit 32
  fi
done

if test -n "$EXPECTED_TARGET_COMMIT" && test "$NEW_COMMIT" != "$EXPECTED_TARGET_COMMIT"; then
  record_result preflight-failed target-moved
  echo "origin/main changed after the rolling deployment target was selected."
  echo "expected_commit=$EXPECTED_TARGET_COMMIT"
  echo "current_origin_main=$NEW_COMMIT"
  exit 27
fi

echo "old_commit=$OLD_COMMIT"
echo "new_commit=$NEW_COMMIT"

if test "$OLD_COMMIT" = "$NEW_COMMIT"; then
  if ! run_ssm_check; then
    record_result already-current ssm-check-failed
    echo "SSM check failed. Backend was not restarted."
    exit 29
  fi

  restarted=0
  if ! pm2_process_matches runtime; then
    DEPLOYMENT_STARTED=1
    if ! start_or_restart_pm2_ssm; then
      rollback_deployment "PM2 SSM startup failed on the current commit"
    fi
    restarted=1
  fi

  if ! HEALTH_RESULT=$(trap - ERR; wait_for_health); then
    if test "$restarted" -eq 1; then rollback_deployment "health check failed"; fi
    record_result already-current health-failed
    echo "Already on latest main, but the health check failed."
    exit 21
  fi
  if ! READINESS_RESULT=$(trap - ERR; wait_for_readiness); then
    if test "$restarted" -eq 1; then rollback_deployment "readiness check failed"; fi
    record_result already-current readiness-failed
    echo "Already on latest main, but the readiness check failed."
    exit 28
  fi
  if ! COURSES_RESULT=$(trap - ERR; check_courses); then
    if test "$restarted" -eq 1; then rollback_deployment "courses API validation failed"; fi
    record_result already-current courses-failed
    echo "Already on latest main, but the courses check failed."
    exit 22
  fi
  if ! pm2_process_matches runtime || ! ss -ltnp | grep -q ':3000'; then
    if test "$restarted" -eq 1; then rollback_deployment "PM2 SSM runtime check failed"; fi
    record_result already-current runtime-failed
    echo "Already on latest main, but the runtime check failed."
    exit 23
  fi

  if test "$(git -C "$REPOSITORY" rev-parse HEAD)" != "$NEW_COMMIT"; then
    if test "$restarted" -eq 1; then rollback_deployment "deployed commit changed during verification"; fi
    record_result already-current commit-failed
    echo "Already on latest main, but the deployed commit changed."
    exit 30
  fi

  if test "$restarted" -eq 1 && ! pm2 save; then
    rollback_deployment "PM2 save failed"
  fi

  trap - ERR
  DEPLOYMENT_STARTED=0
  record_result already-current not-required
  echo "Already running latest main."
  echo "commit=$OLD_COMMIT"
  echo "health=$HEALTH_RESULT"
  echo "ready=$READINESS_RESULT"
  echo "courses=$COURSES_RESULT"
  exit 0
fi

if ! run_ssm_check; then
  record_result preflight-failed ssm-check-failed
  echo "SSM check failed before changing production. Backend was not restarted."
  exit 29
fi

DEPLOYMENT_STARTED=1

if ! git checkout main; then
  rollback_deployment "git checkout main failed"
fi

if ! git reset --hard "$NEW_COMMIT"; then
  rollback_deployment "git reset to origin/main failed"
fi

cd "$EXPECTED_FRONTEND"

if ! npm ci --no-audit --no-fund; then
  rollback_deployment "frontend npm ci failed"
fi

if ! npm run build; then
  rollback_deployment "frontend production build failed"
fi

cd "$EXPECTED_BACKEND"

if test ! -f package-lock.json; then
  rollback_deployment "package-lock.json is missing in the target commit"
fi

if ! npm ci --omit=dev --no-audit --no-fund; then
  rollback_deployment "npm ci failed"
fi

if ! run_ssm_check; then
  rollback_deployment "SSM check failed before PM2 restart" no
fi

if ! start_or_restart_pm2_ssm; then
  rollback_deployment "PM2 SSM startup failed"
fi

if ! HEALTH_RESULT=$(trap - ERR; wait_for_health); then
  rollback_deployment "health check failed"
fi

if ! READINESS_RESULT=$(trap - ERR; wait_for_readiness); then
  rollback_deployment "readiness check failed"
fi

if ! COURSES_RESULT=$(trap - ERR; check_courses); then
  rollback_deployment "courses API validation failed"
fi

if ! pm2_process_matches runtime; then
  rollback_deployment "PM2 process is not online in SSM mode"
fi

if ! ss -ltnp | grep -q ':3000'; then
  rollback_deployment "port 3000 is not listening"
fi

if ! CURRENT_COMMIT=$(trap - ERR; git -C "$REPOSITORY" rev-parse HEAD); then
  rollback_deployment "could not read the deployed commit"
fi

if test "$CURRENT_COMMIT" != "$NEW_COMMIT"; then
  rollback_deployment "deployed commit does not equal origin/main"
fi

if ! pm2 save; then
  rollback_deployment "PM2 save failed"
fi

trap - ERR
DEPLOYMENT_STARTED=0
COMMIT_SUBJECT="$(git -C "$REPOSITORY" log -1 --format=%s)"
record_result success not-required

echo "DEPLOYMENT SUCCESS"
echo "commit=$NEW_COMMIT"
echo "subject=$COMMIT_SUBJECT"
echo "timestamp=$DEPLOYMENT_TIMESTAMP"
echo "health=$HEALTH_RESULT"
echo "ready=$READINESS_RESULT"
echo "courses=$COURSES_RESULT"
