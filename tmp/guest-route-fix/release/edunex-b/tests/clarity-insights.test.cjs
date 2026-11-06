const test = require('node:test');
const assert = require('node:assert/strict');

const servicePath = require.resolve('../services/clarityInsights');

function freshService() {
  delete require.cache[servicePath];
  return require(servicePath);
}

function resetClarityEnv() {
  delete process.env.CLARITY_API_TOKEN;
  delete process.env.CLARITY_DATA_EXPORT_TOKEN;
  delete process.env.CLARITY_API_KEY;
  delete process.env.MICROSOFT_CLARITY_API_TOKEN;
  delete process.env.MS_CLARITY_API_TOKEN;
  delete process.env.CLARITY_NUM_DAYS;
}

test('Clarity dashboard reports a backend token configuration hint when missing', async (t) => {
  const previousFetch = global.fetch;
  t.after(() => {
    global.fetch = previousFetch;
    resetClarityEnv();
  });
  resetClarityEnv();

  const { getClarityDashboardInsights } = freshService();
  const result = await getClarityDashboardInsights();

  assert.equal(result.configured, false);
  assert.match(result.reason, /Set CLARITY_API_TOKEN on the API server/);
});

test('Clarity dashboard accepts common backend token aliases', async (t) => {
  const previousFetch = global.fetch;
  t.after(() => {
    global.fetch = previousFetch;
    resetClarityEnv();
  });
  resetClarityEnv();
  process.env.CLARITY_API_KEY = 'alias-token';
  process.env.CLARITY_NUM_DAYS = '2';

  const requested = [];
  global.fetch = async (url, options) => {
    requested.push({ url: String(url), authorization: options?.headers?.Authorization });
    return {
      ok: true,
      async text() {
        return JSON.stringify([
          {
            metricName: 'Traffic',
            information: [{ URL: '/admin', totalSessionCount: 3, distinctUserCount: 2 }],
          },
        ]);
      },
    };
  };

  const { getClarityDashboardInsights } = freshService();
  const result = await getClarityDashboardInsights();

  assert.equal(result.configured, true);
  assert.equal(result.numOfDays, 2);
  assert.equal(result.totals.sessions, 3);
  assert.equal(result.totals.users, 2);
  assert.equal(requested.length, 4);
  assert.ok(requested.every((request) => request.authorization === 'Bearer alias-token'));
  assert.ok(requested.every((request) => request.url.includes('numOfDays=2')));
});
