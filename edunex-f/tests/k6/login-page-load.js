import http from "k6/http";
import { check, sleep } from "k6";
import { parseHTML } from "k6/html";

const targetUrl = (__ENV.TARGET_URL || "http://localhost:5173").replace(/\/+$/, "");
const loginPath = __ENV.LOGIN_PATH || "/login";
const profile = __ENV.PROFILE || "smoke";
const includeAssets = (__ENV.INCLUDE_ASSETS || "false").toLowerCase() === "true";
const exactRequests = Number(__ENV.REQUESTS || 0);
const runLabel = __ENV.RUN_LABEL || (exactRequests ? `${exactRequests}-requests` : profile);

function exactRequestScenario(totalRequests) {
  const vus = Number(__ENV.VUS || Math.min(Math.max(Math.ceil(totalRequests / 10), 1), 250));
  return {
    executor: "shared-iterations",
    vus,
    iterations: totalRequests,
    maxDuration: __ENV.MAX_DURATION || "10m",
  };
}

function scenarioFor(name) {
  if (exactRequests > 0) return exactRequestScenario(exactRequests);

  if (name === "local-10k" || name === "aws-10k") {
    return {
      executor: "ramping-vus",
      stages: [
        { duration: "2m", target: 1000 },
        { duration: "4m", target: 5000 },
        { duration: "4m", target: 10050 },
        { duration: "5m", target: 10050 },
        { duration: "2m", target: 0 },
      ],
      gracefulRampDown: "30s",
    };
  }

  if (name === "quick") {
    return {
      executor: "constant-vus",
      vus: 25,
      duration: "30s",
    };
  }

  return {
    executor: "constant-vus",
    vus: 1,
    duration: "10s",
  };
}

export const options = {
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
  scenarios: {
    login_page: scenarioFor(profile),
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1200", "p(99)<2500"],
    checks: ["rate>0.99"],
  },
};

function isExternalTenKRun() {
  const isTenK = profile === "aws-10k" || profile === "local-10k" || exactRequests >= 10000;
  const isLocal =
    targetUrl.includes("localhost") ||
    targetUrl.includes("127.0.0.1") ||
    targetUrl.includes("0.0.0.0");
  return isTenK && !isLocal;
}

export function setup() {
  if (isExternalTenKRun() && __ENV.ALLOW_EXTERNAL_10K !== "true") {
    throw new Error(
      "Refusing to run a 10k external load test. Re-run with ALLOW_EXTERNAL_10K=true after confirming the target can take it."
    );
  }

  return {
    loginUrl: `${targetUrl}${loginPath}`,
  };
}

function firstPartyAssetUrls(html, pageUrl) {
  const doc = parseHTML(html);
  const urls = [];

  doc.find("link[href], script[src]").each((_, el) => {
    const raw = el.attr("href") || el.attr("src");
    if (!raw || raw.startsWith("http") || raw.startsWith("//") || raw.startsWith("data:")) return;
    urls.push(new URL(raw, pageUrl).toString());
  });

  return [...new Set(urls)].slice(0, 12);
}

export default function (data) {
  const page = http.get(data.loginUrl, {
    tags: { name: "GET /login" },
  });

  check(page, {
    "login page returned 200": (res) => res.status === 200,
    "login page returned app shell": (res) => /id="root"|login|sign in|credentials/i.test(res.body || ""),
  });

  if (includeAssets && page.status === 200) {
    const requests = firstPartyAssetUrls(page.body || "", data.loginUrl).map((url) => [
      "GET",
      url,
      null,
      { tags: { name: "first-party asset" } },
    ]);

    if (requests.length) {
      const responses = http.batch(requests);
      responses.forEach((res) => {
        check(res, {
          "asset returned 200": (assetRes) => assetRes.status === 200,
        });
      });
    }
  }

  sleep(1);
}

function pick(metric, field) {
  return metric?.values?.[field] ?? null;
}

export function handleSummary(data) {
  const safeLabel = runLabel.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
  const requests = data.metrics.http_reqs?.values?.count || 0;
  const failedRate = pick(data.metrics.http_req_failed, "rate");
  const p95 = pick(data.metrics.http_req_duration, "p(95)");
  const p99 = pick(data.metrics.http_req_duration, "p(99)");
  const max = pick(data.metrics.http_req_duration, "max");
  const checksRate = pick(data.metrics.checks, "rate");
  const avg = pick(data.metrics.http_req_duration, "avg");
  const summaryText = [
    `Login page k6 report: ${runLabel}`,
    `Target: ${targetUrl}${loginPath}`,
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
    `# Login Page k6 Report: ${runLabel}`,
    "",
    `- Target: ${targetUrl}${loginPath}`,
    `- Profile: ${profile}`,
    `- Requested iterations: ${exactRequests || "duration-based"}`,
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
    [`reports/k6/login-page-${safeLabel}.json`]: JSON.stringify(data, null, 2),
    [`reports/k6/login-page-${safeLabel}.md`]: markdown,
  };
}
