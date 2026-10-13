const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const phonePe = require('../services/phonePeStandardAutoPayService');
const scheduler = require('../services/phonePeAutoPayScheduler');
const standardController = require('../controllers/phonePeStandardAutoPayController');

function sandboxEnv(overrides = {}) {
  return {
    NODE_ENV: 'test',
    PHONEPE_AUTOPAY_ENABLED: 'true',
    PHONEPE_AUTOPAY_WEB_ENABLED: 'true',
    PHONEPE_AUTOPAY_SCHEDULER_ENABLED: 'false',
    PHONEPE_AUTOPAY_LIVE_RECURRING_ENABLED: 'false',
    PHONEPE_AUTOPAY_MODE: 'sandbox',
    PHONEPE_AUTOPAY_BASE_URL: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
    PHONEPE_AUTOPAY_AUTH_BASE_URL: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
    PHONEPE_AUTOPAY_MERCHANT_ID: 'TEST_MERCHANT',
    PHONEPE_AUTOPAY_CLIENT_ID: `client-${Math.random()}`,
    PHONEPE_AUTOPAY_CLIENT_SECRET: 'test-secret',
    PHONEPE_AUTOPAY_CLIENT_VERSION: '1',
    PHONEPE_AUTOPAY_CALLBACK_URL: 'https://api.example.test/api/webhooks/phonepe/autopay',
    PHONEPE_AUTOPAY_REDIRECT_URL: 'https://example.test/payment',
    PHONEPE_AUTOPAY_WEBHOOK_AUTH_TYPE: 'sha',
    PHONEPE_AUTOPAY_WEBHOOK_USERNAME: 'test-user',
    PHONEPE_AUTOPAY_WEBHOOK_PASSWORD: 'test-password',
    ...overrides,
  };
}

test('trial setup is ₹1 with a variable ₹499 on-demand Standard Checkout mandate', () => {
  const request = phonePe.buildSetupRequest({
    merchantOrderId: 'PPS_TEST_1',
    merchantSubscriptionId: 'PPA_TEST_1',
    userId: 'learner-1',
    paymentType: 'trial',
    redirectUrl: 'https://example.test/payment',
    now: 1700000000000,
  });
  assert.equal(request.amount, 100);
  assert.equal(request.paymentFlow.type, 'SUBSCRIPTION_CHECKOUT_SETUP');
  assert.equal(request.paymentFlow.subscriptionDetails.subscriptionType, 'RECURRING');
  assert.equal(request.paymentFlow.subscriptionDetails.maxAmount, 49900);
  assert.equal(request.paymentFlow.subscriptionDetails.amountType, 'VARIABLE');
  assert.equal(request.paymentFlow.subscriptionDetails.frequency, 'ON_DEMAND');

  const monthly = phonePe.buildSetupRequest({
    merchantOrderId: 'PPS_TEST_2',
    merchantSubscriptionId: 'PPA_TEST_2',
    paymentType: 'monthly',
    redirectUrl: 'https://example.test/payment',
  });
  assert.equal(monthly.amount, 49900);
  assert.equal(monthly.paymentFlow.subscriptionDetails.maxAmount, 49900);
  assert.equal(monthly.paymentFlow.subscriptionDetails.amountType, 'FIXED');
  assert.equal(monthly.paymentFlow.subscriptionDetails.frequency, 'MONTHLY');
});

test('explicit PhonePe setup rejection is retryable, while ambiguous failures remain uncertain', () => {
  assert.equal(standardController.isDefinitiveSetupRejection({ providerStatus: 400 }), true);
  assert.equal(standardController.isDefinitiveSetupRejection({ providerStatus: 422 }), true);
  assert.equal(standardController.isDefinitiveSetupRejection({ providerStatus: 429 }), false);
  assert.equal(standardController.isDefinitiveSetupRejection({ providerStatus: 500 }), false);
  assert.equal(standardController.isDefinitiveSetupRejection(new Error('timeout')), false);
});

test('renewal notification is hard-limited to ₹499 and requires explicit redeem later', () => {
  const request = phonePe.buildNotifyRequest({
    merchantOrderId: 'PPR_TEST_1',
    merchantSubscriptionId: 'PPA_TEST_1',
    userId: 'learner-1',
    cycle: 1,
    now: 1700000000000,
  });
  assert.equal(request.amount, 49900);
  assert.equal(request.expireAt, 1700000000000 + (24 * 60 * 60 * 1000));
  assert.equal(request.paymentFlow.type, 'SUBSCRIPTION_CHECKOUT_REDEMPTION');
  assert.equal(request.paymentFlow.autoDebit, false);
  assert.equal(request.paymentFlow.redemptionRetryStrategy, 'STANDARD');
});

test('production service calls only Standard Checkout v2 endpoints', async () => {
  const calls = [];
  const env = sandboxEnv();
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/v1/oauth/token')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'test-token', expires_in: 300 }) };
    }
    if (url.endsWith('/checkout/v2/pay')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ orderId: 'PHONEPE_SETUP', state: 'PENDING', redirectUrl: 'https://mercury-t2.phonepe.com/checkout' }) };
    }
    if (url.endsWith('/checkout/v2/subscriptions/PPA_TEST_3/status')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ merchantSubscriptionId: 'PPA_TEST_3', subscriptionId: 'SUBSCRIPTION_3', state: 'ACTIVE', maxAmount: 49900, amountType: 'FIXED', frequency: 'MONTHLY' }) };
    }
    if (url.endsWith('/checkout/v2/subscriptions/notify')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ orderId: 'PHONEPE_NOTIFY', state: 'NOTIFICATION_IN_PROGRESS' }) };
    }
    if (url.endsWith('/checkout/v2/subscriptions/redeem')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ transactionId: 'PHONEPE_REDEEM', state: 'PENDING' }) };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  await phonePe.createSubscription({
    merchantOrderId: 'PPS_TEST_3', merchantSubscriptionId: 'PPA_TEST_3',
    userId: 'learner-3', paymentType: 'trial',
  }, { env, fetchImpl });
  await phonePe.getSubscriptionStatus('PPA_TEST_3', { env, fetchImpl });
  await phonePe.notifyRedemption({
    merchantOrderId: 'PPR_TEST_3', merchantSubscriptionId: 'PPA_TEST_3', userId: 'learner-3', cycle: 1,
  }, { env, fetchImpl });
  await phonePe.redeem('PPR_TEST_3', { env, fetchImpl });

  const providerCalls = calls.filter(call => !call.url.endsWith('/v1/oauth/token'));
  assert.deepEqual(providerCalls.map(call => call.url), [
    'https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/pay',
    'https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/subscriptions/PPA_TEST_3/status',
    'https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/subscriptions/notify',
    'https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/subscriptions/redeem',
  ]);
  assert.equal(JSON.stringify(providerCalls).includes('/subscriptions/v2/'), false);
});

test('live ₹499 notify/redeem stays blocked behind a separate kill switch', () => {
  const env = sandboxEnv({
    PHONEPE_AUTOPAY_MODE: 'live',
    PHONEPE_AUTOPAY_BASE_URL: 'https://api.phonepe.com/apis/pg',
    PHONEPE_AUTOPAY_AUTH_BASE_URL: 'https://api.phonepe.com/apis/identity-manager',
    PHONEPE_AUTOPAY_LIVE_RECURRING_ENABLED: 'false',
  });
  assert.throws(
    () => phonePe.requireConfigured({ env, recurringDebit: true }),
    /Live PhonePe recurring debits are disabled/
  );
});

test('scheduler notifies 24 hours before the first billing time', () => {
  const nextBillingAt = new Date('2026-10-13T10:00:00.000Z');
  assert.equal(
    scheduler.notificationDueAt({ nextBillingAt }).toISOString(),
    '2026-10-12T10:00:00.000Z'
  );
});

test('an uncertain setup becomes retryable only after PhonePe confirms the order does not exist', async () => {
  const updates = [];
  const billing = {
    _id: 'user-1',
    attempt: 'attempt-1',
    phase: 'uncertain',
    setupMerchantOrderId: 'PPS_MISSING_1',
  };
  const recovered = await standardController.recoverMissingUncertainSetup(billing, {
    provider: {
      getOrderStatus: async () => {
        throw Object.assign(new Error('not found'), { providerCode: 'ORDER_NOT_FOUND', providerStatus: 400 });
      },
    },
    billingModel: { updateOne: async (...args) => updates.push(['billing', ...args]) },
    orderModel: { updateOne: async (...args) => updates.push(['order', ...args]) },
  });
  assert.equal(recovered.phase, 'failed');
  assert.equal(recovered.providerState, 'ORDER_NOT_FOUND');
  assert.equal(updates.length, 2);

  const stillUncertain = await standardController.recoverMissingUncertainSetup(billing, {
    provider: {
      getOrderStatus: async () => {
        throw Object.assign(new Error('timeout'), { providerCode: 'TIMEOUT', providerStatus: 504 });
      },
    },
    billingModel: { updateOne: async () => assert.fail('must not unlock an ambiguous checkout') },
    orderModel: { updateOne: async () => assert.fail('must not unlock an ambiguous checkout') },
  });
  assert.equal(stillUncertain.phase, 'uncertain');
});

test('new PhonePe web paths preserve Razorpay and mobile store integrations', () => {
  const paymentRoutes = fs.readFileSync(path.join(__dirname, '../routes/payment.js'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const frontend = fs.readFileSync(path.join(__dirname, '../../edunex-f/src/pages/PaymentPage.jsx'), 'utf8');
  assert.match(paymentRoutes, /router\.post\('\/webhooks\/razorpay', razorpay\.webhook\)/);
  assert.match(paymentRoutes, /router\.post\('\/webhooks\/phonepe\/autopay'/);
  assert.match(paymentRoutes, /standardPhonePe\.initiate/);
  assert.match(paymentRoutes, /PhonePeAutoPayBilling/);
  assert.match(server, /req\.path\.startsWith\('\/api\/webhooks\/phonepe'\)/);
  assert.match(server, /require\('\.\/routes\/appleIap'\)/);
  assert.match(server, /require\('\.\/routes\/googlePlayIap'\)/);
  assert.match(frontend, /window\.location\.assign\(data\.redirectUrl\)/);
  assert.match(frontend, /accessKind/);
  assert.match(frontend, /Trial subscription is active/);
  assert.match(fs.readFileSync(path.join(__dirname, '../controllers/phonePeStandardAutoPayController.js'), 'utf8'), /account\.access\.status !== 'trial'/);
});
