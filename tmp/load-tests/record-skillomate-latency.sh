#!/bin/sh

set -u

api_base="${K6_API_BASE:-http://127.0.0.1:6565/v1}"
interval_seconds="${LATENCY_SAMPLE_INTERVAL_SECONDS:-30}"
output_path="${LATENCY_OUTPUT_PATH:-tmp/load-tests/skillomate-latency-timeseries.csv}"

if [ ! -f "$output_path" ]; then
  printf '%s\n' 'timestamp,vus,vus_max,requests,request_rate_per_second,failure_rate,check_rate,latency_avg_ms,latency_median_ms,latency_p90_ms,latency_p95_ms,latency_max_ms' > "$output_path"
fi

while :; do
  status_json=$(curl --silent --show-error --max-time 3 "$api_base/status") || break
  metrics_json=$(curl --silent --show-error --max-time 3 "$api_base/metrics") || break

  running=$(printf '%s' "$status_json" | jq -r '.data.attributes.running')
  vus=$(printf '%s' "$status_json" | jq -r '.data.attributes.vus')
  vus_max=$(printf '%s' "$status_json" | jq -r '.data.attributes["vus-max"]')

  printf '%s' "$metrics_json" | jq -r \
    --arg timestamp "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
    --arg vus "$vus" \
    --arg vus_max "$vus_max" '
      def m($id): first(.data[] | select(.id == $id)).attributes.sample;
      [
        $timestamp,
        $vus,
        $vus_max,
        m("http_reqs").count,
        m("http_reqs").rate,
        m("http_req_failed").rate,
        m("checks").rate,
        m("http_req_duration").avg,
        m("http_req_duration").med,
        m("http_req_duration")["p(90)"],
        m("http_req_duration")["p(95)"],
        m("http_req_duration").max
      ] | @csv
    ' >> "$output_path"

  if [ "$running" != "true" ]; then
    break
  fi

  sleep "$interval_seconds"
done
