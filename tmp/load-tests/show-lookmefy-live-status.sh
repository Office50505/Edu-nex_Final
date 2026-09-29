#!/usr/bin/env bash

set -u

readonly TEST_PATTERN='k6 run --summary-export tmp/load-tests/lookmefy-500vu-30m-summary.json tmp/load-tests/lookmefy-500vu-30m.js'
readonly SUMMARY_PATH='/Users/ayankhan/Desktop/edunex/Edu-nex_Final/tmp/load-tests/lookmefy-500vu-30m-summary.json'

target_vus_for_elapsed() {
  local elapsed=$1
  if (( elapsed < 120 )); then
    echo $(( elapsed * 50 / 120 ))
  elif (( elapsed < 300 )); then
    echo $(( 50 + (elapsed - 120) * 100 / 180 ))
  elif (( elapsed < 600 )); then
    echo $(( 150 + (elapsed - 300) * 150 / 300 ))
  elif (( elapsed < 900 )); then
    echo $(( 300 + (elapsed - 600) * 200 / 300 ))
  elif (( elapsed < 1500 )); then
    echo 500
  elif (( elapsed < 1800 )); then
    echo $(( 500 - (elapsed - 1500) * 500 / 300 ))
  else
    echo 0
  fi
}

phase_for_elapsed() {
  local elapsed=$1
  if (( elapsed < 900 )); then
    echo 'RAMPING UP'
  elif (( elapsed < 1500 )); then
    echo 'HOLDING 500 VUs'
  elif (( elapsed < 1800 )); then
    echo 'RAMPING DOWN'
  else
    echo 'FINALIZING'
  fi
}

probe() {
  local label=$1
  local url=$2
  local result
  result=$(curl -sS --max-time 8 -o /dev/null -w '%{http_code} %{time_total}' "$url" 2>/dev/null || echo '000 timeout')
  printf '%-19s %s\n' "$label" "$result"
}

while true; do
  pid=$(pgrep -f "$TEST_PATTERN" | head -n 1)
  printf '\033[2J\033[H'
  printf 'LOOKMEFY 500-VU LOAD TEST — LIVE STATUS\n'
  printf 'Updated: %s\n\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')"

  if [[ -z "${pid:-}" ]]; then
    printf 'k6 process: FINISHED\n'
    printf 'Summary: %s\n' "$SUMMARY_PATH"
    exit 0
  fi

  elapsed_text=$(ps -p "$pid" -o etime= | tr -d ' ')
  elapsed_minutes=${elapsed_text%:*}
  elapsed_seconds=${elapsed_text##*:}
  elapsed_total=$(( 10#$elapsed_minutes * 60 + 10#$elapsed_seconds ))
  remaining=$(( 1800 - elapsed_total ))
  (( remaining < 0 )) && remaining=0

  printf 'k6 PID:            %s (RUNNING)\n' "$pid"
  printf 'Elapsed:           %s / 30:00\n' "$elapsed_text"
  printf 'Remaining:         %02d:%02d\n' "$(( remaining / 60 ))" "$(( remaining % 60 ))"
  printf 'Phase:             %s\n' "$(phase_for_elapsed "$elapsed_total")"
  printf 'Scheduled VUs:     ~%s / 500\n\n' "$(target_vus_for_elapsed "$elapsed_total")"

  printf 'Endpoint            HTTP latency_seconds\n'
  probe 'API health' 'https://api.lookmefy.in/api/health'
  probe 'Storefront config' 'https://api.lookmefy.in/api/storefront/config'
  probe 'Products' 'https://api.lookmefy.in/api/products?limit=12'

  printf '\nAuto-abort: >2%% failures, API p95 >2s, or repeated health failures.\n'
  printf 'Refresh interval: 5 seconds. Press Ctrl+C only to close this dashboard.\n'
  sleep 5
done
