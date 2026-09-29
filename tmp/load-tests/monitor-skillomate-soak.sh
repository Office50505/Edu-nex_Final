#!/bin/sh

set -u

api_base="${K6_API_BASE:-http://127.0.0.1:6565/v1}"
interval_seconds="${MONITOR_INTERVAL_SECONDS:-10}"

printf '%s\n' 'Skillomate soak-test live monitor (Ctrl-C stops only this monitor)'
printf '%s\n' 'timestamp                  VUs       requests    req/s    failures    checks    median    p95       max'

while :; do
  status_json=$(curl --silent --show-error --max-time 3 "$api_base/status") || break
  metrics_json=$(curl --silent --show-error --max-time 3 "$api_base/metrics") || break

  running=$(printf '%s' "$status_json" | jq -r '.data.attributes.running')
  vus=$(printf '%s' "$status_json" | jq -r '.data.attributes.vus')
  vus_max=$(printf '%s' "$status_json" | jq -r '.data.attributes["vus-max"]')

  printf '%-26s' "$(date '+%Y-%m-%d %H:%M:%S %Z')"
  printf '%s' "$metrics_json" | jq -r --arg vus "$vus" --arg vus_max "$vus_max" '
    def m($id): first(.data[] | select(.id == $id)).attributes.sample;
    "\($vus)/\($vus_max)   \(m("http_reqs").count)       \(m("http_reqs").rate | floor)       \((m("http_req_failed").rate * 10000 | floor) / 100)%       \((m("checks").rate * 10000 | floor) / 100)%    \(m("http_req_duration").med | floor)ms     \(m("http_req_duration")["p(95)"] | floor)ms     \(m("http_req_duration").max | floor)ms"
  '

  if [ "$running" != "true" ]; then
    break
  fi

  sleep "$interval_seconds"
done
