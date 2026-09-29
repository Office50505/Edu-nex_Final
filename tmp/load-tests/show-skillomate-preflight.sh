#!/usr/bin/env bash

set -u

printf '\033[2J\033[H'
printf 'SKILLOMATE 500-VU TEST — PREFLIGHT\n'
printf '==================================\n\n'
printf '500-VU load test: NOT STARTED\n'
printf 'Reason: the existing API health endpoint is timing out.\n\n'

probe() {
  local label=$1
  local url=$2
  printf '%s\n' "$label"
  curl --max-time 12 -o /dev/null \
    -w 'HTTP=%{http_code} connect=%{time_connect}s first_byte=%{time_starttransfer}s total=%{time_total}s\n' \
    "$url"
  printf '\n'
}

probe 'Homepage:' 'https://skillomate.in/'
probe 'API health:' 'https://skillomate.in/api/health'

printf 'Required before testing:\n'
printf '  1. Local EC2 health returns HTTP 200 on port 3000.\n'
printf '  2. ALB target is Healthy.\n'
printf '  3. Public /api/health returns HTTP 200 under 2 seconds.\n\n'
printf 'This window will remain open. Press any key to close.\n'
read -r -n 1
