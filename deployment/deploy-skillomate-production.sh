#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly LOCAL_REPOSITORY="${SKILLOMATE_LOCAL_REPOSITORY:-$(cd "$SCRIPT_DIR/.." && pwd)}"
readonly REMOTE_DEPLOY_SCRIPT="${SKILLOMATE_REMOTE_DEPLOY_SCRIPT:-$LOCAL_REPOSITORY/deployment/deploy-skillomate.sh}"
readonly SSM_BOOTSTRAP="$LOCAL_REPOSITORY/edunex-b/ssm-bootstrap.js"
readonly SSH_KEY="${SKILLOMATE_SSH_KEY:-$HOME/Downloads/Skillomate_Key.pem}"
readonly SSH_COMMAND="${SKILLOMATE_SSH_COMMAND:-ssh}"
readonly LOG_DIRECTORY="${SKILLOMATE_DEPLOY_LOG_DIRECTORY:-$HOME/skillomate-deployment-logs}"
readonly LOCK_DIRECTORY="${SKILLOMATE_DEPLOY_LOCK_DIRECTORY:-${TMPDIR:-/tmp}/skillomate-rolling-deploy.lock}"
readonly REMOTE_REPOSITORY="/home/ubuntu/skillomate_repo"

readonly -a INSTANCES=(
  "EC2 #1|13.235.104.167"
  "EC2 #2|3.108.8.89"
  "EC2 #3|13.201.21.124"
)

lock_acquired=0

release_lock() {
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

if test ! -f "$SSH_KEY"; then
  echo "Skillomate SSH key not found: $SSH_KEY"
  echo "Set SKILLOMATE_SSH_KEY to the private-key path and retry."
  exit 1
fi

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

mkdir -p -- "$LOG_DIRECTORY"
chmod 700 "$LOG_DIRECTORY"
acquire_lock

readonly DEPLOYMENT_TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
readonly -a SSH_OPTIONS=(
  -i "$SSH_KEY"
  -o BatchMode=yes
  -o ConnectTimeout=10
)

first_instance="${INSTANCES[0]}"
first_host="${first_instance#*|}"
TARGET_COMMIT="$("$SSH_COMMAND" "${SSH_OPTIONS[@]}" "ubuntu@$first_host" \
  "git -C '$REMOTE_REPOSITORY' fetch --prune origin main >/dev/null && git -C '$REMOTE_REPOSITORY' rev-parse origin/main")"

if [[ ! "$TARGET_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Could not resolve a valid origin/main commit from EC2 #1."
  exit 1
fi

echo "Rolling deployment target: $TARGET_COMMIT"

for instance in "${INSTANCES[@]}"; do
  label="${instance%%|*}"
  host="${instance#*|}"
  slug="$(printf '%s' "$label" | /usr/bin/tr '[:upper:] #' '[:lower:]--')"
  log_file="$LOG_DIRECTORY/$DEPLOYMENT_TIMESTAMP-$slug.log"

  echo "=== $label ==="
  echo "host=$host" >"$log_file"
  echo "target_commit=$TARGET_COMMIT" >>"$log_file"
  echo "config_source=ssm" >>"$log_file"
  chmod 600 "$log_file"

  if "$SSH_COMMAND" "${SSH_OPTIONS[@]}" "ubuntu@$host" \
    "bash -s -- '$TARGET_COMMIT'" <"$REMOTE_DEPLOY_SCRIPT" 2>&1 | /usr/bin/tee -a "$log_file"; then
    echo "DEPLOY SUCCESS" | /usr/bin/tee -a "$log_file"
  else
    deployment_status=${PIPESTATUS[0]}
    echo "DEPLOY FAILED" | /usr/bin/tee -a "$log_file"
    echo "Rolling deployment stopped at $label. Remaining instances were not touched." | /usr/bin/tee -a "$log_file"
    exit "$deployment_status"
  fi

  echo
done

echo "ROLLING DEPLOYMENT COMPLETE"
