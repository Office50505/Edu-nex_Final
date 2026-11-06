import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
const apiUrl = process.env.API_URL || "http://localhost:3000";
const steps = (process.env.STEPS || "1000,5000,10000,25000,50000,100000")
  .split(",")
  .map((step) => Number(step.trim()))
  .filter((step) => Number.isFinite(step) && step > 0);
const stopOnFail = process.env.STOP_ON_FAIL === "true";

if (!steps.length) {
  console.error("No valid STEPS provided. Example: STEPS=1000,5000,10000,25000,50000,100000");
  process.exit(1);
}

mkdirSync("reports/k6", { recursive: true });

function pct(value) {
  return typeof value === "number" ? `${(value * 100).toFixed(2)}%` : "n/a";
}

function ms(value) {
  return typeof value === "number" ? `${value.toFixed(2)} ms` : "n/a";
}

function readMetrics(label) {
  const path = `reports/k6/complete-local-${label}.json`;
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

for (const journeys of steps) {
  if (shouldStop) break;

  const label = `${journeys}-journeys`;
  const vus = String(Math.min(Math.max(Math.ceil(journeys / 100), 10), 500));
  console.log(`\n=== k6 complete local software: ${journeys} user journeys (${vus} VUs) ===`);

  const result = spawnSync(
    "k6",
    ["run", "tests/k6/complete-local-software.js"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        FRONTEND_URL: frontendUrl,
        API_URL: apiUrl,
        JOURNEYS: String(journeys),
        RUN_LABEL: label,
        VUS: process.env.VUS || vus,
      },
    }
  );

  if (result.status !== 0 && stopOnFail) {
    console.error(`Stopping after ${journeys} journeys because k6 failed.`);
    shouldStop = true;
  }
}

const rows = [];
for (const journeys of steps) {
  const label = `${journeys}-journeys`;
  const metrics = readMetrics(label);
  if (!metrics) {
    rows.push(`| ${journeys} | not run | n/a | n/a | n/a | n/a | n/a | n/a | n/a | reports/k6/complete-local-${label}.md |`);
    continue;
  }

  const result =
    metrics.failedRate < 0.01
    && metrics.checkRate > 0.99
    && metrics.p95 < 2000
    && metrics.p99 < 5000
      ? "pass"
      : "fail";

  rows.push([
    `| ${journeys}`,
    result,
    metrics.requests ?? "n/a",
    pct(metrics.failedRate),
    pct(metrics.checkRate),
    ms(metrics.avg),
    ms(metrics.p95),
    ms(metrics.p99),
    ms(metrics.max),
    `reports/k6/complete-local-${label}.md |`,
  ].join(" | "));
}

const index = [
  "# Complete Local Software k6 Report",
  "",
  `- Frontend: ${frontendUrl}`,
  `- API: ${apiUrl}`,
  `- Steps: ${steps.join(", ")} user journeys`,
  "- Scope: frontend page shells plus safe backend read APIs",
  "- Excluded: login submissions, OTP, payment, AI chat, admin writes, deletes, wishlist toggles",
  "",
  "| User Journeys | Result | HTTP Requests | Failed | Checks | Avg | p95 | p99 | Max | Report |",
  "| ---: | :---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ...rows,
  "",
].join("\n");

writeFileSync("reports/k6/complete-local-index.md", index);
console.log("\nWrote reports/k6/complete-local-index.md");
