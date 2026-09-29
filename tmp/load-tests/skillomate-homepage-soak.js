import http from 'k6/http';
import { check, sleep } from 'k6';

const targetUrl = __ENV.TARGET_URL || 'https://skillomate.in/';
const targetVus = Number(__ENV.TARGET_VUS || 500);
const rampOne = __ENV.RAMP_ONE || '1m';
const rampTwo = __ENV.RAMP_TWO || '4m';
const rampThree = __ENV.RAMP_THREE || '5m';
const holdDuration = __ENV.HOLD_DURATION || '105m';
const rampDown = __ENV.RAMP_DOWN || '5m';
const minThinkSeconds = Number(__ENV.MIN_THINK_SECONDS || 3);
const maxThinkSeconds = Number(__ENV.MAX_THINK_SECONDS || 7);

export const options = {
  discardResponseBodies: true,
  scenarios: {
    homepage_soak: {
      executor: 'ramping-vus',
      startVUs: 0,
      gracefulRampDown: '30s',
      stages: [
        { duration: rampOne, target: Math.max(1, Math.round(targetVus * 0.1)) },
        { duration: rampTwo, target: Math.max(1, Math.round(targetVus * 0.5)) },
        { duration: rampThree, target: targetVus },
        { duration: holdDuration, target: targetVus },
        { duration: rampDown, target: 0 },
      ],
    },
  },
  thresholds: {
    // Stop the run if the public endpoint persistently fails. This is a safety
    // guard, not a performance SLO for the application.
    http_req_failed: [
      {
        threshold: 'rate<0.10',
        abortOnFail: true,
        delayAbortEval: '2m',
      },
    ],
    checks: [
      {
        threshold: 'rate>0.90',
        abortOnFail: true,
        delayAbortEval: '2m',
      },
    ],
  },
  userAgent: 'Skillomate-Authorized-Soak-Test/2026-09-21 (k6)',
};

export default function () {
  const response = http.get(targetUrl, {
    redirects: 3,
    timeout: '15s',
    tags: { endpoint: 'public_homepage' },
  });

  check(response, {
    'homepage returns HTTP 200': (result) => result.status === 200,
    'homepage returns HTML': (result) =>
      String(result.headers['Content-Type'] || '').toLowerCase().includes('text/html'),
  });

  const thinkSeconds =
    minThinkSeconds + Math.random() * Math.max(0, maxThinkSeconds - minThinkSeconds);
  sleep(thinkSeconds);
}

export function handleSummary(data) {
  const outputPath = __ENV.SUMMARY_PATH || 'tmp/load-tests/skillomate-soak-summary.json';

  return {
    [outputPath]: JSON.stringify(data, null, 2),
  };
}
