import http from "k6/http";
import { check, sleep } from "k6";

const frontendUrl = (__ENV.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");
const apiUrl = (__ENV.API_URL || "http://localhost:3000").replace(/\/+$/, "");
const journeys = Number(__ENV.JOURNEYS || 1000);
const runLabel = __ENV.RUN_LABEL || `${journeys}-journeys`;
const vus = Number(__ENV.VUS || Math.min(Math.max(Math.ceil(journeys / 100), 10), 500));
const includeHeavyHealth = (__ENV.INCLUDE_HEAVY_HEALTH || "false").toLowerCase() === "true";

export const options = {
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
  scenarios: {
    complete_local_software: {
      executor: "shared-iterations",
      vus,
      iterations: journeys,
      maxDuration: __ENV.MAX_DURATION || "45m",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<2000", "p(99)<5000"],
    checks: ["rate>0.99"],
  },
};

const frontendPages = [
  { name: "landing", path: "/" },
  { name: "login", path: "/login.html" },
  { name: "signup", path: "/signup.html" },
  { name: "courses-page", path: "/courses.html" },
  { name: "about", path: "/about.html" },
];

const apiReads = [
  { name: "categories-api", path: "/api/categories" },
  { name: "courses-api", path: "/api/courses" },
  { name: "checkout-summary-api", path: "/api/courses/checkout-summary" },
];

if (includeHeavyHealth) {
  apiReads.unshift({ name: "db-health-api", path: "/api/health/db" });
}

function pick(metric, field) {
  return metric?.values?.[field] ?? null;
}

function frontendRequest(page) {
  return [
    "GET",
    `${frontendUrl}${page.path}`,
    null,
    { tags: { name: `FE ${page.name}`, surface: "frontend" } },
  ];
}

function apiRequest(api) {
  return [
    "GET",
    `${apiUrl}${api.path}`,
    null,
    { tags: { name: `API ${api.name}`, surface: "api" } },
  ];
}

export default function () {
  const responses = http.batch([
    ...frontendPages.map(frontendRequest),
    ...apiReads.map(apiRequest),
  ]);

  responses.forEach((response) => {
    check(response, {
      [`${response.request.url} returned 200`]: (res) => res.status === 200,
      [`${response.request.url} returned body`]: (res) => Boolean(res.body),
    });
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
    `Complete local software k6 report: ${runLabel}`,
    `Frontend: ${frontendUrl}`,
    `API: ${apiUrl}`,
    `User journeys: ${journeys}`,
    `VUs: ${vus}`,
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
    `# Complete Local Software k6 Report: ${runLabel}`,
    "",
    `- Frontend: ${frontendUrl}`,
    `- API: ${apiUrl}`,
    `- User journeys: ${journeys}`,
    `- VUs: ${vus}`,
    `- Requests per journey: ${frontendPages.length + apiReads.length}`,
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
    [`reports/k6/complete-local-${safeLabel}.json`]: JSON.stringify(data, null, 2),
    [`reports/k6/complete-local-${safeLabel}.md`]: markdown,
  };
}
