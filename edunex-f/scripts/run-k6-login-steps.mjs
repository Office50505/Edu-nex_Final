import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const targetUrl = process.env.TARGET_URL || "http://localhost:5173";
const loginPath = process.env.LOGIN_PATH || "/login";
const steps = (process.env.STEPS || "10,100,1000,10000")
  .split(",")
  .map((step) => Number(step.trim()))
  .filter((step) => Number.isFinite(step) && step > 0);

if (!steps.length) {
  console.error("No valid STEPS provided. Example: STEPS=10,100,1000,10000");
  process.exit(1);
}

mkdirSync("reports/k6", { recursive: true });

const summaryRows = [];

function pct(value) {
  return typeof value === "number" ? `${(value * 100).toFixed(2)}%` : "n/a";
}

function ms(value) {
  return typeof value === "number" ? `${value.toFixed(2)} ms` : "n/a";
}

function readStepMetrics(label) {
  const path = `reports/k6/login-page-${label}.json`;
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

for (const requests of steps) {
  const label = `${requests}-requests`;
  const vus = String(Math.min(Math.max(Math.ceil(requests / 10), 1), 250));
  console.log(`\n=== k6 login page step: ${requests} requests (${vus} VUs) ===`);

  const result = spawnSync(
    "k6",
    ["run", "tests/k6/login-page-load.js"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        TARGET_URL: targetUrl,
        LOGIN_PATH: loginPath,
        REQUESTS: String(requests),
        RUN_LABEL: label,
        VUS: process.env.VUS || vus,
      },
    }
  );

  const metrics = readStepMetrics(label);
  summaryRows.push([
    `| ${requests}`,
    result.status === 0 ? "pass" : "fail",
    metrics?.requests ?? "n/a",
    pct(metrics?.failedRate),
    pct(metrics?.checkRate),
    ms(metrics?.avg),
    ms(metrics?.p95),
    ms(metrics?.p99),
    ms(metrics?.max),
    `reports/k6/login-page-${label}.md |`,
  ].join(" | "));

  if (result.status !== 0) {
    console.error(`Stopping after ${requests} requests because k6 failed.`);
    break;
  }
}

const index = [
  "# Login Page k6 Step Reports",
  "",
  `- Target: ${targetUrl}${loginPath}`,
  `- Steps: ${steps.join(", ")}`,
  "",
  "| Step | Result | HTTP Requests | Failed | Checks | Avg | p95 | p99 | Max | Report |",
  "| ---: | :---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ...summaryRows,
  "",
].join("\n");

writeFileSync("reports/k6/login-page-index.md", index);
console.log("\nWrote reports/k6/login-page-index.md");
