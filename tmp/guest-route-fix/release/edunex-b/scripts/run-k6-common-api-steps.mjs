import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const targetUrl = process.env.TARGET_URL || "http://localhost:3000";
const reportScope = (process.env.REPORT_SCOPE || "local").replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
const steps = (process.env.STEPS || "10,100,1000,10000")
  .split(",")
  .map((step) => Number(step.trim()))
  .filter((step) => Number.isFinite(step) && step > 0);
const includeAuth = process.env.INCLUDE_AUTH === "true" && Boolean(process.env.AUTH_TOKEN);
const includeAccess = process.env.INCLUDE_ACCESS === "true" && Boolean(process.env.AUTH_TOKEN);
const stopOnFail = process.env.STOP_ON_FAIL === "true";
const endpointFilter = (process.env.ENDPOINTS || "")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);

const allEndpoints = [
  { name: "root", method: "GET", path: "/" },
  { name: "health-db", method: "GET", path: "/api/health/db" },
  { name: "categories", method: "GET", path: "/api/categories" },
  { name: "courses", method: "GET", path: "/api/courses" },
  { name: "checkout-summary", method: "GET", path: "/api/courses/checkout-summary" },
  { name: "bunny-videos", method: "GET", path: "/api/bunny/videos" },
];

if (includeAuth) {
  allEndpoints.push(
    { name: "auth-me", method: "GET", path: "/api/auth/me" },
    { name: "subscription-status", method: "GET", path: "/api/payment/subscription-status" },
    { name: "verify-app-access", method: "GET", path: "/api/payment/verify-app-access" },
    { name: "wishlist", method: "GET", path: "/api/wishlist" }
  );
}

if (includeAccess && process.env.COURSE_ID) {
  allEndpoints.push(
    { name: "course-lessons", method: "GET", path: `/api/courses/${process.env.COURSE_ID}/lessons` },
    { name: "progress", method: "GET", path: `/api/progress?course=${process.env.COURSE_ID}` },
    { name: "ai-tutor-history", method: "GET", path: `/api/ai-tutor?course=${process.env.COURSE_ID}` }
  );
}

const endpoints = endpointFilter.length
  ? allEndpoints.filter((endpoint) => endpointFilter.includes(endpoint.name))
  : allEndpoints;

if (!steps.length) {
  console.error("No valid STEPS provided. Example: STEPS=10,100,1000,10000");
  process.exit(1);
}

mkdirSync("reports/k6", { recursive: true });

function pct(value) {
  return typeof value === "number" ? `${(value * 100).toFixed(2)}%` : "n/a";
}

function ms(value) {
  return typeof value === "number" ? `${value.toFixed(2)} ms` : "n/a";
}

function readStepMetrics(label) {
  const path = `reports/k6/common-api-${label}.json`;
  if (!existsSync(path)) return null;

  const data = JSON.parse(readFileSync(path, "utf8"));
  const duration = data.metrics.http_req_duration?.values || {};
  return {
    requests: data.metrics.http_reqs?.values?.count,
    failedRate: data.metrics.http_req_failed?.values?.rate,
    checkRate: data.metrics.checks?.values?.rate,
    avg: duration.avg,
    p95: duration["p(95)"],
    p99: duration["p(99)"],
    max: duration.max,
  };
}

let shouldStop = false;

for (const endpoint of endpoints) {
  if (shouldStop) break;

  for (const requests of steps) {
    const label = `${endpoint.name}-${requests}-requests`;
    const scopedLabel = `${reportScope}-${label}`;
    const vus = String(Math.min(Math.max(Math.ceil(requests / 10), 1), 250));
    console.log(`\n=== k6 API step: ${endpoint.method} ${endpoint.path} | ${requests} requests (${vus} VUs) ===`);

    const result = spawnSync(
      "k6",
      ["run", "tests/k6/common-api-load.js"],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          TARGET_URL: targetUrl,
          ENDPOINT_NAME: endpoint.name,
          ENDPOINT_PATH: endpoint.path,
          METHOD: endpoint.method,
          EXPECTED_STATUS: String(endpoint.expectedStatus || 200),
          REQUESTS: String(requests),
          RUN_LABEL: scopedLabel,
          VUS: process.env.VUS || vus,
        },
      }
    );

    if (result.status !== 0 && stopOnFail) {
      console.error(`Stopping after ${endpoint.name} at ${requests} requests because k6 failed.`);
      shouldStop = true;
      break;
    }
  }
}

const summaryRows = [];
for (const endpoint of allEndpoints) {
  for (const requests of steps) {
    const label = `${reportScope}-${endpoint.name}-${requests}-requests`;
    const metrics = readStepMetrics(label);
    if (!metrics) {
      summaryRows.push([
        `| ${endpoint.method} ${endpoint.path}`,
        requests,
        "not run",
        "n/a",
        "n/a",
        "n/a",
        "n/a",
        "n/a",
        "n/a",
        "n/a",
        `reports/k6/common-api-${label}.md |`,
      ].join(" | "));
      continue;
    }

    const result =
      metrics.failedRate < 0.01
      && metrics.checkRate > 0.99
      && metrics.p95 < 1500
      && metrics.p99 < 3000
        ? "pass"
        : "fail";

    summaryRows.push([
      `| ${endpoint.method} ${endpoint.path}`,
      requests,
      result,
      metrics.requests ?? "n/a",
      pct(metrics.failedRate),
      pct(metrics.checkRate),
      ms(metrics.avg),
      ms(metrics.p95),
      ms(metrics.p99),
      ms(metrics.max),
      `reports/k6/common-api-${label}.md |`,
    ].join(" | "));
  }
}

const index = [
  "# Common API k6 Step Reports",
  "",
  `- Target: ${targetUrl}`,
  `- Report scope: ${reportScope}`,
  `- Steps: ${steps.join(", ")}`,
  `- Auth endpoints included: ${includeAuth ? "yes" : "no"}`,
  `- Subscription/access endpoints included: ${includeAccess && process.env.COURSE_ID ? "yes" : "no"}`,
  "",
  "| Endpoint | Step | Result | HTTP Requests | Failed | Checks | Avg | p95 | p99 | Max | Report |",
  "| --- | ---: | :---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ...summaryRows,
  "",
].join("\n");

const indexPath = `reports/k6/common-api-${reportScope}-index.md`;
writeFileSync(indexPath, index);
console.log(`\nWrote ${indexPath}`);
