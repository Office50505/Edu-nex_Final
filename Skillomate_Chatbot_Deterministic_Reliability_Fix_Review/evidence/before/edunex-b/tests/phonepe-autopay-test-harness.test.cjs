const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const autoPay = require('../services/phonePeAutoPayService');
const autoPayRoutes = require('../routes/phonePeAutoPayTest');
const autoPayController = require('../controllers/phonePeAutoPayTestController');

const enabledMockEnv = {
  NODE_ENV: 'test',
  PHONEPE_AUTOPAY_TEST_ROUTES_ENABLED: 'true',
  PHONEPE_AUTOPAY_ENABLED: 'true',
  PHONEPE_AUTOPAY_MODE: 'mock',
  PHONEPE_AUTOPAY_MERCHANT_ID: 'TEST_MERCHANT',
  PHONEPE_AUTOPAY_WEBHOOK_AUTH_TYPE: 'sha',
  PHONEPE_AUTOPAY_WEBHOOK_USERNAME: 'callback-user',
  PHONEPE_AUTOPAY_WEBHOOK_PASSWORD: 'callback-password',
};

test('AutoPay test access requires non-production plus both explicit feature flags', () => {
  assert.equal(autoPayRoutes.autoPayTestRoutesAllowed(enabledMockEnv), true);
  assert.equal(autoPayRoutes.autoPayTestRoutesAllowed({ ...enabledMockEnv, NODE_ENV: 'production' }), false);
  assert.equal(autoPayRoutes.autoPayTestRoutesAllowed({ ...enabledMockEnv, PHONEPE_AUTOPAY_ENABLED: 'false' }), false);
  assert.equal(autoPayRoutes.autoPayTestRoutesAllowed({ ...enabledMockEnv, PHONEPE_AUTOPAY_TEST_ROUTES_ENABLED: 'false' }), false);

  const routeSource = fs.readFileSync(path.join(__dirname, '../routes/phonePeAutoPayTest.js'), 'utf8');
  for (const endpoint of ['create-mandate', 'status/:mandateId', 'debit']) {
    const line = routeSource.split('\n').find(candidate => candidate.includes(endpoint));
    assert.match(line, /protectAdmin, requireAutoPayTestAccess/);
  }
});

test('service refuses production and non-PhonePe credential hosts', () => {
  assert.throws(() => autoPay.requireConfigured({ env: { ...enabledMockEnv, NODE_ENV: 'production' } }), /unavailable in production/);
  assert.throws(() => autoPay.requireConfigured({ env: {
    ...enabledMockEnv,
    PHONEPE_AUTOPAY_MODE: 'sandbox',
    PHONEPE_AUTOPAY_CLIENT_ID: 'client',
    PHONEPE_AUTOPAY_CLIENT_SECRET: 'secret',
    PHONEPE_AUTOPAY_CALLBACK_URL: 'https://example.test/api/webhooks/phonepe/autopay',
    PHONEPE_AUTOPAY_REDIRECT_URL: 'https://example.test/autopay/return',
    PHONEPE_AUTOPAY_AUTH_BASE_URL: 'https://attacker.example/collect',
  } }), /official PhonePe pre-production auth host/);
});

test('create mandate builder is fixed to ₹1 and an on-demand fixed mandate', () => {
  const payload = autoPay.buildCreateMandateRequest({
    merchantOrderId: 'APTO_TEST_1',
    merchantSubscriptionId: 'APTS_TEST_1',
    testId: 'APT_TEST_1',
    userId: 'test-user',
    amount: 100,
    redirectUrl: 'https://example.test/autopay/return',
    now: 1700000000000,
  });
  assert.equal(payload.amount, 100);
  assert.equal(payload.expireAfter, 900);
  assert.equal(payload.paymentFlow.type, 'SUBSCRIPTION_CHECKOUT_SETUP');
  assert.equal(payload.paymentFlow.merchantUrls.redirectUrl, 'https://example.test/autopay/return');
  assert.equal(payload.paymentFlow.subscriptionDetails.subscriptionType, 'RECURRING');
  assert.equal(payload.paymentFlow.subscriptionDetails.maxAmount, 100);
  assert.equal(payload.paymentFlow.subscriptionDetails.amountType, 'FIXED');
  assert.equal(payload.paymentFlow.subscriptionDetails.frequency, 'ON_DEMAND');
  assert.equal(payload.metaInfo.udf2, 'SKILLOMATE_AUTOPAY_TEST');
  assert.throws(() => autoPay.buildCreateMandateRequest({
    merchantOrderId: 'APTO_TEST_2', merchantSubscriptionId: 'APTS_TEST_2', amount: 49900,
  }), /exactly 100 paise/);
});

test('createMandate sends the documented Standard Checkout v2 request without exposing credentials', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/v1/oauth/token')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'short-lived-token', expires_in: 300 }) };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ orderId: 'PHONEPE_ORDER', state: 'PENDING', redirectUrl: 'https://mercury-t2.phonepe.com/mandate-test' }) };
  };
  const env = {
    ...enabledMockEnv,
    PHONEPE_AUTOPAY_MODE: 'sandbox',
    PHONEPE_AUTOPAY_CLIENT_ID: 'sandbox-client-for-test',
    PHONEPE_AUTOPAY_CLIENT_SECRET: 'sandbox-secret-for-test',
    PHONEPE_AUTOPAY_CLIENT_VERSION: '1',
    PHONEPE_AUTOPAY_CALLBACK_URL: 'https://example.test/api/webhooks/phonepe/autopay',
    PHONEPE_AUTOPAY_REDIRECT_URL: 'https://example.test/autopay/return',
    PHONEPE_AUTOPAY_BASE_URL: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
  };
  const result = await autoPay.createMandate({
    merchantOrderId: 'APTO_NETWORK_TEST',
    merchantSubscriptionId: 'APTS_NETWORK_TEST',
    testId: 'APT_NETWORK_TEST',
    userId: 'test-user',
    amount: 100,
  }, { env, fetchImpl });
  assert.equal(calls[0].url, 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token');
  assert.equal(calls[1].url, 'https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/pay');
  const request = JSON.parse(calls[1].options.body);
  assert.equal(request.amount, 100);
  assert.equal(request.paymentFlow.type, 'SUBSCRIPTION_CHECKOUT_SETUP');
  assert.equal(request.paymentFlow.subscriptionDetails.maxAmount, 100);
  assert.equal(request.paymentFlow.merchantUrls.redirectUrl, 'https://example.test/autopay/return');
  assert.equal(request.deviceContext, undefined);
  assert.equal(request.paymentFlow.paymentMode, undefined);
  assert.equal(calls[1].options.headers.Authorization, 'O-Bearer short-lived-token');
  assert.equal(calls[1].options.headers['X-MERCHANT-ID'], undefined);
  assert.equal(JSON.stringify(request).includes('sandbox-secret-for-test'), false);
  assert.equal(result.approvalUrl, 'https://mercury-t2.phonepe.com/mandate-test');
});

test('X-MERCHANT-ID is sent only for an explicitly configured partner integration', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/v1/oauth/token')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'partner-token', expires_in: 300 }) };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ orderId: 'PHONEPE_ORDER', state: 'PENDING', redirectUrl: 'https://mercury-t2.phonepe.com/mandate-test' }) };
  };
  const env = {
    ...enabledMockEnv,
    PHONEPE_AUTOPAY_MODE: 'sandbox',
    PHONEPE_AUTOPAY_CLIENT_ID: 'partner-client',
    PHONEPE_AUTOPAY_CLIENT_SECRET: 'partner-secret',
    PHONEPE_AUTOPAY_CLIENT_VERSION: '1',
    PHONEPE_AUTOPAY_CALLBACK_URL: 'https://example.test/api/webhooks/phonepe/autopay',
    PHONEPE_AUTOPAY_REDIRECT_URL: 'https://example.test/autopay/return',
    PHONEPE_AUTOPAY_BASE_URL: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
    PHONEPE_AUTOPAY_PARTNER_MERCHANT_ID: 'END_MERCHANT',
  };
  await autoPay.createMandate({
    merchantOrderId: 'APTO_PARTNER_TEST',
    merchantSubscriptionId: 'APTS_PARTNER_TEST',
    testId: 'APT_PARTNER_TEST',
    userId: 'test-user',
    amount: 100,
  }, { env, fetchImpl });
  assert.equal(calls[1].options.headers['X-MERCHANT-ID'], 'END_MERCHANT');
});

test('status, notify, and redeem use only Standard Checkout AutoPay endpoints', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/v1/oauth/token')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'standard-flow-token', expires_in: 300 }) };
    }
    if (url.endsWith('/checkout/v2/subscriptions/APTS_STANDARD/status')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({
        merchantSubscriptionId: 'APTS_STANDARD',
        subscriptionId: 'PHONEPE_SUBSCRIPTION',
        state: 'ACTIVE',
        maxAmount: 100,
        amountType: 'FIXED',
        frequency: 'ON_DEMAND',
      }) };
    }
    if (url.endsWith('/checkout/v2/subscriptions/notify')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ orderId: 'PHONEPE_NOTIFY_ORDER', state: 'NOTIFICATION_IN_PROGRESS' }) };
    }
    if (url.endsWith('/checkout/v2/subscriptions/redeem')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ transactionId: 'PHONEPE_TRANSACTION', state: 'PENDING' }) };
    }
    throw new Error(`Unexpected test URL: ${url}`);
  };
  const env = {
    ...enabledMockEnv,
    PHONEPE_AUTOPAY_MODE: 'sandbox',
    PHONEPE_AUTOPAY_CLIENT_ID: 'standard-flow-client',
    PHONEPE_AUTOPAY_CLIENT_SECRET: 'standard-flow-secret',
    PHONEPE_AUTOPAY_CLIENT_VERSION: '1',
    PHONEPE_AUTOPAY_CALLBACK_URL: 'https://example.test/api/webhooks/phonepe/autopay',
    PHONEPE_AUTOPAY_REDIRECT_URL: 'https://example.test/autopay/return',
    PHONEPE_AUTOPAY_BASE_URL: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
  };

  const status = await autoPay.getMandateStatus('APTS_STANDARD', { env, fetchImpl });
  const notification = await autoPay.executeDebit({
    operation: 'notify',
    merchantOrderId: 'APTD_STANDARD',
    merchantSubscriptionId: 'APTS_STANDARD',
    testId: 'APT_STANDARD',
    amount: 100,
  }, { env, fetchImpl });
  const redemption = await autoPay.executeDebit({
    operation: 'redeem', merchantOrderId: 'APTD_STANDARD', amount: 100,
  }, { env, fetchImpl });

  assert.equal(status.state, 'ACTIVE');
  assert.equal(notification.state, 'NOTIFICATION_IN_PROGRESS');
  assert.equal(redemption.transactionId, 'PHONEPE_TRANSACTION');
  const providerCalls = calls.filter(call => !call.url.endsWith('/v1/oauth/token'));
  assert.deepEqual(providerCalls.map(call => call.url), [
    'https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/subscriptions/APTS_STANDARD/status',
    'https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/subscriptions/notify',
    'https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/subscriptions/redeem',
  ]);
  const notifyBody = JSON.parse(providerCalls[1].options.body);
  assert.equal(notifyBody.amount, 100);
  assert.equal(notifyBody.paymentFlow.type, 'SUBSCRIPTION_CHECKOUT_REDEMPTION');
  assert.equal(JSON.stringify(providerCalls).includes('/subscriptions/v2/'), false);
});

test('provider setup failures retain only sanitized diagnostic fields', async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith('/v1/oauth/token')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'short-lived-token', expires_in: 300 }) };
    }
    return {
      ok: false,
      status: 403,
      text: async () => JSON.stringify({
        code: 'FEATURE_NOT_ENABLED',
        detailedErrorCode: 'AUTOPAY_DISABLED',
        message: 'Rejected O-Bearer should-never-be-retained',
      }),
    };
  };
  const env = {
    ...enabledMockEnv,
    PHONEPE_AUTOPAY_MODE: 'sandbox',
    PHONEPE_AUTOPAY_CLIENT_ID: 'sandbox-client-for-test',
    PHONEPE_AUTOPAY_CLIENT_SECRET: 'sandbox-secret-for-test',
    PHONEPE_AUTOPAY_CLIENT_VERSION: '1',
    PHONEPE_AUTOPAY_CALLBACK_URL: 'https://example.test/api/webhooks/phonepe/autopay',
    PHONEPE_AUTOPAY_REDIRECT_URL: 'https://example.test/autopay/return',
    PHONEPE_AUTOPAY_BASE_URL: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
  };
  await assert.rejects(
    autoPay.createMandate({
      merchantOrderId: 'APTO_FAILURE_TEST',
      merchantSubscriptionId: 'APTS_FAILURE_TEST',
      testId: 'APT_FAILURE_TEST',
      userId: 'test-user',
      amount: 100,
    }, { env, fetchImpl }),
    error => {
      assert.equal(error.providerStatus, 403);
      assert.equal(error.providerCode, 'FEATURE_NOT_ENABLED');
      assert.equal(error.providerDetailedCode, 'AUTOPAY_DISABLED');
      assert.equal(error.providerMessage, 'Rejected [redacted-auth]');
      assert.equal(error.providerMessage.includes('should-never-be-retained'), false);
      return true;
    }
  );
});

test('debit always requires explicit confirmation and exactly ₹1', () => {
  assert.throws(() => autoPayController.debitBody({ body: { amount: 100, mandateId: 'APTS_TEST' } }), /confirmTestDebit/);
  assert.throws(() => autoPayController.debitBody({ body: { confirmTestDebit: true, amount: 49900, mandateId: 'APTS_TEST' } }), /exactly 100 paise/);
  assert.deepEqual(
    autoPayController.debitBody({ body: { confirmTestDebit: true, amount: 100, mandateId: 'APTS_TEST' } }),
    { mandateId: 'APTS_TEST' }
  );
  const notify = autoPay.buildDebitNotificationRequest({
    merchantOrderId: 'APTD_TEST', merchantSubscriptionId: 'APTS_TEST', testId: 'APT_TEST', amount: 100,
  });
  assert.equal(notify.amount, 100);
  assert.equal(notify.paymentFlow.type, 'SUBSCRIPTION_CHECKOUT_REDEMPTION');
  assert.equal(notify.paymentFlow.autoDebit, false);
  assert.equal(notify.paymentFlow.redemptionRetryStrategy, 'STANDARD');
});

test('signed raw webhook updates only the isolated test record', async () => {
  const payload = {
    event: 'checkout.order.completed',
    payload: {
      merchantId: 'TEST_MERCHANT',
      merchantOrderId: 'APTO_TEST_1',
      state: 'COMPLETED',
      metaInfo: { udf1: 'APT_TEST_1' },
      paymentFlow: {
        merchantSubscriptionId: 'APTS_TEST_1',
        subscriptionId: 'PHONEPE_MANDATE_1',
      },
    },
  };
  const raw = Buffer.from(JSON.stringify(payload));
  const authorization = crypto.createHash('sha256').update('callback-user:callback-password').digest('hex');
  const verification = autoPay.verifyWebhook(raw, { authorization }, { env: enabledMockEnv });
  assert.equal(verification.valid, true);

  let captured;
  const record = {
    testId: 'APT_TEST_1',
    userId: 'test-user',
    requestId: 'APTR_TEST_1',
    merchantOrderId: 'APTO_TEST_1',
    merchantSubscriptionId: 'APTS_TEST_1',
    phonePeMandateId: 'PHONEPE_MANDATE_1',
    status: 'ACTIVE',
  };
  const Model = {
    async findOneAndUpdate(query, update, options) {
      captured = { query, update, options };
      return record;
    },
  };
  const result = await autoPayController.applyVerifiedWebhook({
    payload: verification.payload,
    rawPayload: verification.rawPayload,
    headers: { 'x-request-id': 'provider-request-1' },
  }, { Model });
  assert.equal(result.matched, true);
  assert.equal(captured.update.$set.status, 'ACTIVE');
  assert.equal(captured.update.$set.phonePeMandateId, 'PHONEPE_MANDATE_1');
  assert.equal(captured.update.$push.webhookEvents.$each[0].rawPayload, raw.toString('utf8'));
  assert.equal(captured.options.runValidators, true);
});

test('notification webhooks update debit state without replacing ACTIVE mandate state', () => {
  const mutation = autoPayController.webhookMutation({
    event: 'subscription.notification.completed',
    payload: {
      merchantOrderId: 'APTD_TEST_1',
      state: 'NOTIFIED',
      amount: 100,
      paymentFlow: { merchantSubscriptionId: 'APTS_TEST_1', subscriptionId: 'PHONEPE_MANDATE_1' },
    },
  }, '{}');
  assert.equal(mutation.update.$set.status, undefined);
  assert.equal(mutation.update.$set['debit.notifyState'], 'NOTIFIED');

  const wrongAmount = autoPayController.webhookMutation({
    event: 'subscription.redemption.order.completed',
    payload: { merchantOrderId: 'APTD_TEST_1', amount: 49900 },
  }, '{}');
  assert.equal(wrongAmount.reason, 'amount_mismatch');

  const wrongMandateLimit = autoPayController.webhookMutation({
    event: 'checkout.order.completed',
    payload: {
      merchantOrderId: 'APTO_TEST_1',
      amount: 100,
      paymentFlow: { merchantSubscriptionId: 'APTS_TEST_1', maxAmount: 49900 },
    },
  }, '{}');
  assert.equal(wrongMandateLimit.reason, 'amount_mismatch');
});

test('invalid webhook signature or merchant is rejected', () => {
  const raw = Buffer.from(JSON.stringify({ payload: { merchantId: 'TEST_MERCHANT' } }));
  assert.equal(autoPay.verifyWebhook(raw, { authorization: 'bad' }, { env: enabledMockEnv }).valid, false);
  const authorization = crypto.createHash('sha256').update('callback-user:callback-password').digest('hex');
  const wrongMerchant = Buffer.from(JSON.stringify({ payload: { merchantId: 'OTHER_MERCHANT' } }));
  assert.equal(autoPay.verifyWebhook(wrongMerchant, { authorization }, { env: enabledMockEnv }).reason, 'merchant_mismatch');
});

test('existing payment providers and webhook paths remain present', () => {
  const paymentRoutes = fs.readFileSync(path.join(__dirname, '../routes/payment.js'), 'utf8');
  assert.match(paymentRoutes, /router\.post\('\/payment\/razorpay\/verify', protect, razorpay\.verify\)/);
  assert.match(paymentRoutes, /router\.post\('\/webhooks\/razorpay', razorpay\.webhook\)/);
  assert.match(paymentRoutes, /router\.post\('\/webhooks\/phonepe'/);
  assert.match(paymentRoutes, /paymentController\.handleWebhook\(req, res, next\)/);
  assert.match(paymentRoutes, /router\.use\(autoPayTestRoutes\)/);

  const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  assert.match(server, /require\('\.\/routes\/appleIap'\)/);
  assert.match(server, /require\('\.\/routes\/googlePlayIap'\)/);
});
