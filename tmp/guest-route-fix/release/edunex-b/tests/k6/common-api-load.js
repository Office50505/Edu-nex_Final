import http from "k6/http";
import { check, sleep } from "k6";

const targetUrl = (__ENV.TARGET_URL || "http://localhost:3000").replace(/\/+$/, "");
const endpointName = __ENV.ENDPOINT_NAME || "health-db";
const endpointPath = __ENV.ENDPOINT_PATH || "/api/health/db";
const method = (__ENV.METHOD || "GET").toUpperCase();
const exactRequests = Number(__ENV.REQUESTS || 10);
const vus = Number(__ENV.VUS || Math.min(Math.max(Math.ceil(exactRequests / 10), 1), 250));
const authToken = __ENV.AUTH_TOKEN || "";
const expectedStatus = Number(__ENV.EXPECTED_STATUS || 200);
const runLabel = __ENV.RUN_LABEL || `${endpointName}-${exactRequests}-requests`;

export const options = {
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
  scenarios: {
    common_endpoint: {
      executor: "shared-iterations",
      vus,
      iterations: exactRequests,
      maxDuration: __ENV.MAX_DURATION || "10m",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1500", "p(99)<3000"],
    checks: ["rate>0.99"],
  },
};

function pick(metric, field) {
  return metric?.values?.[field] ?? null;
}

function requestParams() {
  const headers = {
    Accept: "application/json,text/plain,*/*",
  };

  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  return {
    headers,
    tags: { name: `${method} ${endpointPath}`, endpoint: endpointName },
  };
}

export default function () {
  const url = `${targetUrl}${endpointPath}`;
  const response = http.request(method, url, null, requestParams());

  check(response, {
    [`${endpointName} returned ${expectedStatus}`]: (res) => res.status === expectedStatus,
    [`${endpointName} returned a body`]: (res) => Boolean(res.body),
  });

  sleep(1);
}

export function handleSummary(data) {
  const safeLabel = runLabel.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
  const requests = data.metrics.http_reqs?.values?.count || 0;
  const failedRate = pick(data.metrics.http_req_failed, "rate");
  const checksRate = pick(data.metrics.checks, "rate");
  const duration = data.metrics.http_req_duration;
  const avg = pick(duration, "avg");
  const p95 = pick(duration, "p(95)");
  const p99 = pick(duration, "p(99)");
  const max = pick(duration, "max");

  const summaryText = [
    `Common API k6 report: ${runLabel}`,
    `Target: ${targetUrl}${endpointPath}`,
    `HTTP requests: ${requests}`,
    `Failed request rate: ${failedRate === null ? "n/a" : `${(failedRate * 100).toFixed(2)}%`}`,
    `Check pass rate: ${checksRate === null ? "n/a" : `${(checksRate * 100).toFixed(2)}%`}`,
    `Avg duration: ${avg?.toFixed?.(2) ?? "n/a"} ms`,
    `p95 duration: ${p95?.toFixed?.(2) ?? "n/a"} ms`,
    `p99 duration: ${p99?.toFixed?.(2) ?? "n/a"} ms`,
    `Max duration: ${max?.toFixed?.(2) ?? "n/a"} ms`,
    "",
  ].join("\n");

  const markdown = [
    `# Common API k6 Report: ${runLabel}`,
    "",
    `- Endpoint: \`${method} ${endpointPath}\``,
    `- Target: ${targetUrl}`,
    `- Requested iterations: ${exactRequests}`,
    `- VUs: ${vus}`,
    `- HTTP requests: ${requests}`,
    `- Failed request rate: ${failedRate === null ? "n/a" : `${(failedRate * 100).toFixed(2)}%`}`,
    `- Check pass rate: ${checksRate === null ? "n/a" : `${(checksRate * 100).toFixed(2)}%`}`,
    `- Avg duration: ${avg?.toFixed?.(2) ?? "n/a"} ms`,
    `- p95 duration: ${p95?.toFixed?.(2) ?? "n/a"} ms`,
    `- p99 duration: ${p99?.toFixed?.(2) ?? "n/a"} ms`,
    `- Max duration: ${max?.toFixed?.(2) ?? "n/a"} ms`,
    "",
  ].join("\n");

  return {
    stdout: summaryText,
    [`reports/k6/common-api-${safeLabel}.json`]: JSON.stringify(data, null, 2),
    [`reports/k6/common-api-${safeLabel}.md`]: markdown,
  };
}
