#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SSH_KEY="${SKILLOMATE_SSH_KEY:-$SCRIPT_DIRECTORY/../../Skillomate_Key.pem}"

if test ! -f "$SSH_KEY"; then
  echo "Skillomate SSH key not found: $SSH_KEY"
  echo "Set SKILLOMATE_SSH_KEY to the private-key path and retry."
  exit 1
fi

exec ssh \
  -i "$SSH_KEY" \
  -o BatchMode=yes \
  -o ConnectTimeout=10 \
  ubuntu@43.205.137.167 \
  "/home/ubuntu/bin/deploy-skillomate.sh"
