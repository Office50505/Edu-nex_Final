const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.PHONEPE_CLIENT_ID = 'test-client';
process.env.PHONEPE_CLIENT_SECRET = 'test-secret';
process.env.PHONEPE_MERCHANT_ID = 'test-merchant';
process.env.PHONEPE_BASE_URL = 'https://api-preprod.phonepe.com/apis/pg-sandbox';
process.env.PHONEPE_REDIRECT_URL = 'https://api.example.test/api/payment/callback';

const phonePe = require('../services/phonePeService');

test('marketing checkout fails closed when PhonePe Standard AutoPay is unavailable', async (t) => {
  const paymentModes = require('../services/paymentMode');
  const marketing = require('../services/marketingSettings');
  t.mock.method(paymentModes, 'activeProvider', async () => 'phonepe');
  t.mock.method(marketing, 'publicConfig', async () => ({}));
  const previous = {
    mode: process.env.PAYMENT_GATEWAY_MODE,
    enabled: process.env.PHONEPE_ENABLED,
    newPayments: process.env.PHONEPE_NEW_PAYMENTS_ENABLED,
  };
  process.env.PAYMENT_GATEWAY_MODE = 'phonepe';
  process.env.PHONEPE_ENABLED = 'false';
  process.env.PHONEPE_NEW_PAYMENTS_ENABLED = 'false';
  t.after(() => {
    for (const [key, value] of Object.entries({ PAYMENT_GATEWAY_MODE: previous.mode, PHONEPE_ENABLED: previous.enabled, PHONEPE_NEW_PAYMENTS_ENABLED: previous.newPayments })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const router = require('../routes/onboarding');
  const handler = router.stack.find(layer => layer.route?.path === '/config').route.stack[0].handle;
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({}, res);
  assert.equal(res.statusCode, 503);
  assert.match(res.body.error, /Standard AutoPay checkout is temporarily unavailable/);
});

test('marketing checkout cannot silently fall back to the legacy one-time PhonePe controller', () => {
  const routeSource = fs.readFileSync(path.join(__dirname, '../routes/onboarding.js'), 'utf8');
  const paymentRouteSource = fs.readFileSync(path.join(__dirname, '../routes/payment.js'), 'utf8');
  const initiateRouteSource = paymentRouteSource.slice(
    paymentRouteSource.indexOf("router.post('/payment/initiate-trial'"),
    paymentRouteSource.indexOf("router.get('/payment/simulate'")
  );
  assert.doesNotMatch(routeSource, /phonePeBilling\.initiateTrial\(req, res, next\)/);
  assert.match(routeSource, /standardPhonePeBilling\.initiate\(req, res, next\)/);
  assert.match(initiateRouteSource, /provider === 'phonepe'[\s\S]{0,80}standardPhonePe\.initiate/);
  assert.match(initiateRouteSource, /provider === 'simulated'[\s\S]{0,80}paymentController\.initiateTrial/);
});

test('PhonePe direct checkout requests the temporary one-time charge without a subscription setup', async (t) => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/v1/oauth/token')) return { ok: true, text: async () => JSON.stringify({ access_token: 'test-token', expires_in: 300 }) };
    return { ok: true, text: async () => JSON.stringify({ redirectUrl: 'https://checkout.example.test/pay' }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const result = await phonePe.createOneTimePaymentRequest('user-1');
  const payment = requests.find(request => request.url.endsWith('/checkout/v2/pay'));
  assert.ok(payment);
  const body = JSON.parse(payment.options.body);
  assert.equal(body.amount, 100);
  assert.equal(body.paymentFlow.type, 'PG_CHECKOUT');
  assert.equal(body.paymentFlow.message, 'Skillomate 30-day access');
  assert.equal(body.paymentFlow.paymentModeConfig, undefined);
  assert.equal(body.paymentFlow.subscription, undefined);
  assert.equal(body.merchantOrderId, result.merchantTransactionId);
  assert.match(result.merchantTransactionId, /^EDX[A-Z0-9]+$/);
  assert.ok(result.merchantTransactionId.length <= 35);
  assert.match(body.paymentFlow.merchantUrls.redirectUrl, /merchantTransactionId=/);
  assert.equal(payment.options.headers['X-MERCHANT-ID'], undefined);
  assert.equal(payment.options.headers.Authorization, 'O-Bearer test-token');
  assert.equal(result.redirectUrl, 'https://checkout.example.test/pay');
  assert.equal(requests.some(request => request.url.includes('/subscriptions/v2/setup')), false);
});

test('PhonePe checkout URL preserves raw plus signs inside hosted token query params', () => {
  const redirect = 'https://mercury-t2.phonepe.com/transact/pgv3?token=abc+def%2Bghi+jkl&routingKey=W';
  const normalized = phonePe.preserveCheckoutTokenQuery(redirect);

  assert.equal(
    normalized,
    'https://mercury-t2.phonepe.com/transact/pgv3?token=abc%2Bdef%2Bghi%2Bjkl&routingKey=W'
  );
  assert.equal(new URL(normalized).searchParams.get('token'), 'abc+def+ghi+jkl');
});
