import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const baseUrl = (__ENV.BASE_URL || "http://127.0.0.1:3100").replace(/\/+$/, "");
const totalUsers = Number(__ENV.TOTAL_USERS || 100);
const vus = Number(__ENV.VUS || 10);
const thinkTimeSeconds = Number(__ENV.THINK_TIME_SECONDS || 1);
const outputPath = __ENV.SUMMARY_PATH || `output/load-testing/skillomate-${totalUsers}-users.json`;

const endpointFailureRate = new Rate("endpoint_failure_rate");
const frontendDuration = new Trend("frontend_duration", true);
const healthDuration = new Trend("health_duration", true);

export const options = {
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
  scenarios: {
    safe_read_users: {
      executor: "shared-iterations",
      vus,
      iterations: totalUsers,
      maxDuration: __ENV.MAX_DURATION || "15m",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<2000", "p(99)<5000"],
    checks: ["rate>0.99"],
  },
};

const journey = [
  { name: "landing", path: "/", surface: "frontend" },
  { name: "login", path: "/login.html", surface: "frontend" },
  { name: "signup", path: "/signup.html", surface: "frontend" },
  { name: "courses", path: "/courses.html", surface: "frontend" },
  { name: "about", path: "/about.html", surface: "frontend" },
  { name: "health", path: "/api/health", surface: "api" },
];

export default function () {
  const responses = http.batch(journey.map((endpoint) => [
    "GET",
    `${baseUrl}${endpoint.path}`,
    null,
    { tags: { name: endpoint.name, surface: endpoint.surface } },
  ]));

  responses.forEach((response, index) => {
    const endpoint = journey[index];
    const passed = check(response, {
      [`${endpoint.name} returned 200`]: (res) => res.status === 200,
      [`${endpoint.name} returned a body`]: (res) => Boolean(res.body),
    });

    endpointFailureRate.add(!passed, { endpoint: endpoint.name });
    if (endpoint.surface === "frontend") {
      frontendDuration.add(response.timings.duration, { endpoint: endpoint.name });
    } else {
      healthDuration.add(response.timings.duration, { endpoint: endpoint.name });
    }
  });

  sleep(thinkTimeSeconds);
}

export function handleSummary(data) {
  return {
    stdout: `Completed ${totalUsers} user journeys with ${vus} VUs.\n`,
    [outputPath]: JSON.stringify({
      testConfiguration: {
        baseUrl,
        totalUsers,
        vus,
        requestsPerJourney: journey.length,
        thinkTimeSeconds,
        scope: journey,
      },
      result: data,
    }, null, 2),
  };
}
