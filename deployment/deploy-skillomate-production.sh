#!/usr/bin/env bash

set -Eeuo pipefail

exec ssh \
  -i "/Users/kratik/Downloads/Skillomate_Key.pem" \
  -o BatchMode=yes \
  -o ConnectTimeout=10 \
  ubuntu@43.205.137.167 \
  "/home/ubuntu/bin/deploy-skillomate.sh"

