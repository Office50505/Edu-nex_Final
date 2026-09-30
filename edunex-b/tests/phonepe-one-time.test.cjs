const test = require('node:test');
const assert = require('node:assert/strict');

process.env.PHONEPE_CLIENT_ID = 'test-client';
process.env.PHONEPE_CLIENT_SECRET = 'test-secret';
process.env.PHONEPE_MERCHANT_ID = 'test-merchant';
process.env.PHONEPE_BASE_URL = 'https://api-preprod.phonepe.com/apis/pg-sandbox';
process.env.PHONEPE_REDIRECT_URL = 'https://api.example.test/api/payment/callback';

const phonePe = require('../services/phonePeService');

test('PhonePe direct checkout requests exactly 29900 paise without a subscription setup', async (t) => {
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
  assert.equal(body.amount, 29900);
  assert.equal(body.paymentFlow.type, 'PG_CHECKOUT');
  assert.equal(body.paymentFlow.subscription, undefined);
  assert.equal(body.merchantOrderId, result.merchantTransactionId);
  assert.match(body.paymentFlow.merchantUrls.redirectUrl, /merchantTransactionId=/);
  assert.equal(result.redirectUrl, 'https://checkout.example.test/pay');
  assert.equal(requests.some(request => request.url.includes('/subscriptions/v2/setup')), false);
});
