const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resetSensitiveRateLimitsForTests,
  sensitiveRateLimit,
} = require('../middleware/sensitiveRateLimit');

test('sensitive request limiter keys authenticated users and returns Retry-After', () => {
  resetSensitiveRateLimitsForTests();
  const middleware = sensitiveRateLimit({ namespace: 'test-sensitive', windowMs: 60_000, max: 2 });
  const req = { headers: {}, ip: '203.0.113.7', compatAuth: { userId: 'learner-1' } };
  let nextCalls = 0;
  const response = {
    headers: {},
    statusCode: 200,
    payload: null,
    set(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };

  middleware(req, response, () => { nextCalls += 1; });
  middleware(req, response, () => { nextCalls += 1; });
  middleware(req, response, () => { nextCalls += 1; });

  assert.equal(nextCalls, 2);
  assert.equal(response.statusCode, 429);
  assert.equal(response.payload.code, 'RATE_LIMITED');
  assert.match(response.headers['Retry-After'], /^\d+$/);
});
