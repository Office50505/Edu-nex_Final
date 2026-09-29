import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const WEB_URL = "https://lookmefy.in/";
const API_URL = "https://api.lookmefy.in/api";

const healthFailures = new Rate("health_failures");
const healthLatency = new Trend("health_latency", true);

export const options = {
  discardResponseBodies: true,
  scenarios: {
    customer_traffic: {
      executor: "ramping-vus",
      exec: "customerTraffic",
      startVUs: 0,
      stages: [
        { duration: "2m", target: 50 },
        { duration: "3m", target: 150 },
        { duration: "5m", target: 300 },
        { duration: "5m", target: 500 },
        { duration: "10m", target: 500 },
        { duration: "5m", target: 0 },
      ],
      gracefulRampDown: "15s",
      gracefulStop: "15s",
    },
    api_health_monitor: {
      executor: "constant-arrival-rate",
      exec: "apiHealthMonitor",
      rate: 4,
      timeUnit: "1m",
      duration: "30m",
      preAllocatedVUs: 1,
      maxVUs: 2,
      gracefulStop: "5s",
    },
  },
  thresholds: {
    http_req_failed: [
      { threshold: "rate<0.02", abortOnFail: true, delayAbortEval: "2m" },
    ],
    "http_req_duration{scope:api}": [
      { threshold: "p(95)<2000", abortOnFail: true, delayAbortEval: "2m" },
      "p(99)<5000",
    ],
    health_failures: [
      { threshold: "rate<0.20", abortOnFail: true, delayAbortEval: "1m" },
    ],
  },
};

const requestParams = (name, scope) => ({
  headers: {
    Accept: "application/json, text/plain, */*",
    "User-Agent": "Lookmefy-Authorized-Load-Test/1.0",
  },
  tags: { name, scope },
  timeout: "15s",
});

export function customerTraffic() {
  const home = http.get(WEB_URL, requestParams("GET /", "web"));
  check(home, { "homepage is 200": (response) => response.status === 200 }, { kind: "traffic" });

  sleep(1 + Math.random() * 2);

  const config = http.get(
    `${API_URL}/storefront/config`,
    requestParams("GET /api/storefront/config", "api"),
  );
  check(config, { "config is 200": (response) => response.status === 200 }, { kind: "traffic" });

  sleep(1 + Math.random() * 2);

  const products = http.get(
    `${API_URL}/products?limit=12`,
    requestParams("GET /api/products", "api"),
  );
  check(products, { "products is 200": (response) => response.status === 200 }, { kind: "traffic" });

  sleep(2 + Math.random() * 4);
}

export function apiHealthMonitor() {
  const response = http.get(
    `${API_URL}/health`,
    requestParams("GET /api/health", "health"),
  );
  const healthy = response.status === 200;

  healthFailures.add(!healthy);
  healthLatency.add(response.timings.duration);
  check(response, { "health is 200": () => healthy }, { kind: "health" });

  console.log(
    `[API HEALTH] status=${response.status} latency_ms=${response.timings.duration.toFixed(1)}`,
  );
}
