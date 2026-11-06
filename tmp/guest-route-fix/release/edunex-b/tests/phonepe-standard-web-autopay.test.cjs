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
    PHONEPE_AUTOPAY_MOBILE_ENABLED: 'true',
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

test('mobile setup adds the required UPI mandate product and omits web redirect fields', () => {
  const request = phonePe.buildSetupRequest({
    merchantOrderId: 'PPS_MOBILE_1',
    merchantSubscriptionId: 'PPA_MOBILE_1',
    userId: 'learner-mobile-1',
    paymentType: 'trial',
    channel: 'mobile',
    now: 1700000000000,
  });
  assert.equal(request.amount, 100);
  assert.equal(request.metaInfo.udf2, 'SKILLOMATE_MOBILE_AUTOPAY');
  assert.equal(request.paymentFlow.type, 'SUBSCRIPTION_CHECKOUT_SETUP');
  assert.equal(request.paymentFlow.subscriptionDetails.productType, 'UPI_MANDATE');
  assert.equal(request.paymentFlow.subscriptionDetails.amountType, 'VARIABLE');
  assert.equal(request.paymentFlow.subscriptionDetails.maxAmount, 49900);
  assert.equal(request.paymentFlow.subscriptionDetails.frequency, 'ON_DEMAND');
  assert.equal('merchantUrls' in request.paymentFlow, false);
});

test('mobile service creates an SDK order token without exposing credentials', async () => {
  const calls = [];
  const env = sandboxEnv();
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/v1/oauth/token')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'mobile-access-token', expires_in: 300 }) };
    }
    if (url.endsWith('/checkout/v2/sdk/order')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({
        orderId: 'OMO_MOBILE_1', state: 'PENDING', expireAt: 1700003000000, token: 'sdk-order-token',
      }) };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  const result = await phonePe.createMobileSubscription({
    merchantOrderId: 'PPS_MOBILE_2',
    merchantSubscriptionId: 'PPA_MOBILE_2',
    userId: 'learner-mobile-2',
    paymentType: 'trial',
  }, { env, fetchImpl });
  assert.equal(result.orderId, 'OMO_MOBILE_1');
  assert.equal(result.token, 'sdk-order-token');
  assert.equal(result.expireAt, 1700003000000);
  assert.equal(result.state, 'PENDING');
  assert.equal(calls.at(-1).url, 'https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/sdk/order');
  assert.equal(JSON.stringify(result).includes('test-secret'), false);
});

test('mobile SDK order creation has an independent production kill switch', async () => {
  await assert.rejects(
    phonePe.createMobileSubscription({
      merchantOrderId: 'PPS_MOBILE_DISABLED',
      merchantSubscriptionId: 'PPA_MOBILE_DISABLED',
      paymentType: 'trial',
    }, { env: sandboxEnv({ PHONEPE_AUTOPAY_MOBILE_ENABLED: 'false' }) }),
    /mobile checkout is disabled/
  );
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
  assert.equal('expireAt' in request, false);
  assert.equal('metaInfo' in request, false);
  assert.deepEqual(Object.keys(request).sort(), ['amount', 'merchantOrderId', 'paymentFlow']);
  assert.equal(request.paymentFlow.type, 'SUBSCRIPTION_REDEMPTION');
  assert.equal(request.paymentFlow.autoDebit, false);
  assert.equal(request.paymentFlow.redemptionRetryStrategy, 'STANDARD');
});

test('hosted setup uses Standard Checkout while recurring lifecycle uses Custom Checkout v2 endpoints', async () => {
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
    if (url.endsWith('/subscriptions/v2/PPA_TEST_3/status?details=true')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ merchantSubscriptionId: 'PPA_TEST_3', subscriptionId: 'SUBSCRIPTION_3', state: 'ACTIVE', maxAmount: 49900, amountType: 'FIXED', frequency: 'MONTHLY' }) };
    }
    if (url.endsWith('/subscriptions/v2/order/PPR_TEST_3/status?details=true')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({
        merchantOrderId: 'PPR_TEST_3', orderId: 'PHONEPE_NOTIFY', state: 'NOTIFIED', amount: 49900,
        paymentFlow: { merchantSubscriptionId: 'PPA_TEST_3', validAfter: 1700000000000, validUpto: 1700172800000 },
      }) };
    }
    if (url.endsWith('/subscriptions/v2/notify')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ orderId: 'PHONEPE_NOTIFY', state: 'NOTIFICATION_IN_PROGRESS' }) };
    }
    if (url.endsWith('/subscriptions/v2/redeem')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ transactionId: 'PHONEPE_REDEEM', state: 'PENDING' }) };
    }
    if (url.endsWith('/subscriptions/v2/PPA_TEST_3/cancel')) {
      return { ok: true, status: 204, text: async () => '' };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  await phonePe.createSubscription({
    merchantOrderId: 'PPS_TEST_3', merchantSubscriptionId: 'PPA_TEST_3',
    userId: 'learner-3', paymentType: 'trial',
  }, { env, fetchImpl });
  await phonePe.getSubscriptionStatus('PPA_TEST_3', { env, fetchImpl });
  await phonePe.getRedemptionOrderStatus('PPR_TEST_3', { env, fetchImpl });
  await phonePe.notifyRedemption({
    merchantOrderId: 'PPR_TEST_3', merchantSubscriptionId: 'PPA_TEST_3', userId: 'learner-3', cycle: 1,
  }, { env, fetchImpl });
  await phonePe.redeem('PPR_TEST_3', { env, fetchImpl });
  await phonePe.cancel('PPA_TEST_3', { env, fetchImpl });

  const providerCalls = calls.filter(call => !call.url.endsWith('/v1/oauth/token'));
  assert.deepEqual(providerCalls.map(call => call.url), [
    'https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/pay',
    'https://api-preprod.phonepe.com/apis/pg-sandbox/subscriptions/v2/PPA_TEST_3/status?details=true',
    'https://api-preprod.phonepe.com/apis/pg-sandbox/subscriptions/v2/order/PPR_TEST_3/status?details=true',
    'https://api-preprod.phonepe.com/apis/pg-sandbox/subscriptions/v2/notify',
    'https://api-preprod.phonepe.com/apis/pg-sandbox/subscriptions/v2/redeem',
    'https://api-preprod.phonepe.com/apis/pg-sandbox/subscriptions/v2/PPA_TEST_3/cancel',
  ]);
  assert.equal(providerCalls[0].url.endsWith('/checkout/v2/pay'), true);
  assert.equal(providerCalls.slice(1).every(call => call.url.includes('/subscriptions/v2/')), true);
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

test('PhonePe notification retries are deferred to an allowed IST retry window', () => {
  const outsideWindow = new Date('2026-10-14T13:14:00.000Z'); // 18:44 IST
  assert.equal(scheduler.isPhonePeRetryWindow(outsideWindow), false);
  assert.equal(
    scheduler.nextPhonePeRetryWindow(outsideWindow).toISOString(),
    '2026-10-14T16:01:00.000Z' // 21:31 IST
  );
  assert.equal(scheduler.isPhonePeRetryWindow(new Date('2026-10-14T08:00:00.000Z')), true);
});

test('scheduler persists safe PhonePe diagnostics when an uncertain notify retry fails', async () => {
  const updates = [];
  const logs = [];
  const now = new Date('2026-10-14T08:00:00.000Z'); // 13:30 IST, allowed
  const billing = {
    _id: 'user-notify-failure',
    phase: 'active',
    cancelledAt: null,
    currentCycle: {
      merchantOrderId: 'PPR_NOTIFY_FAILURE',
      notifyState: 'UNCERTAIN',
      notifyAttemptCount: 1,
      redeemState: null,
    },
  };
  const result = await scheduler.processBilling(billing, now, {
    billingModel: {
      updateOne: async (...args) => updates.push(args),
      findById: async () => assert.fail('a failed retry must not continue to redemption'),
    },
    controller: {
      reconcileCycle: async () => {
        throw Object.assign(new Error('secret provider response'), {
          providerCode: 'PAYMENT_INSTRUMENT_NOT_SUPPORTED',
          providerStatus: 400,
          providerDetailedCode: 'NO_SUPPORTED_PAYMENT_INSTRUMENT',
        });
      },
    },
    logger: { error: value => logs.push(value) },
  });

  assert.equal(result.failed, 'notify_reconcile');
  assert.equal(updates.length, 1);
  const saved = updates[0][1].$set;
  assert.equal(saved['currentCycle.notifyAttemptCount'], 2);
  assert.equal(saved['currentCycle.notifyFailureCode'], 'PAYMENT_INSTRUMENT_NOT_SUPPORTED');
  assert.equal(saved['currentCycle.notifyFailureStatus'], 400);
  assert.equal(saved['currentCycle.notifyFailureDetailedCode'], 'NO_SUPPORTED_PAYMENT_INSTRUMENT');
  assert.equal(saved['currentCycle.notifyFailureMessage'], 'secret provider response');
  assert.equal(saved['currentCycle.notifyLastAttemptAt'], now);
  assert.ok(saved['currentCycle.notifyRetryAt'] > now);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /code=PAYMENT_INSTRUMENT_NOT_SUPPORTED/);
  assert.doesNotMatch(logs[0], /secret provider response/);
});

test('stored PhonePe provider messages redact authorization values', () => {
  const failure = scheduler.safeProviderFailure(Object.assign(
    new Error('Rejected O-Bearer sensitive.token.value'),
    { providerCode: 'BAD_REQUEST', providerStatus: 400 }
  ));
  assert.equal(failure.message, 'Rejected [redacted-auth]');
  assert.equal(failure.message.includes('sensitive.token.value'), false);
});

test('a failed redemption Execute is observable and remains safe to reconcile', async () => {
  const updates = [];
  const logs = [];
  const now = new Date('2026-10-16T09:30:00.000Z');
  const billing = {
    _id: 'user-execute-failure',
    phase: 'active',
    cancelledAt: null,
    paymentType: 'trial',
    merchantSubscriptionId: 'PPA_EXECUTE_FAILURE',
    currentCycle: {
      sequence: 1,
      merchantOrderId: 'PPR_EXECUTE_FAILURE',
      notifyState: 'NOTIFIED',
      redeemState: null,
      validAfter: new Date('2026-10-16T09:23:00.000Z'),
      validUpto: new Date('2026-10-18T09:23:00.000Z'),
      executeAttemptCount: 0,
    },
  };
  const reserved = {
    ...billing,
    currentCycle: { ...billing.currentCycle, redeemState: 'REQUESTING', executeAttemptCount: 1 },
  };
  const billingModel = {
    updateOne: async (...args) => {
      updates.push(args);
      return { modifiedCount: 1 };
    },
    findOneAndUpdate: async () => reserved,
  };
  const provider = {
    MONTHLY_AMOUNT_PAISE: 49900,
    getSubscriptionStatus: async () => ({
      state: 'ACTIVE',
      subscriptionId: 'PHONEPE_SUBSCRIPTION_1',
      maxAmount: 49900,
      amountType: 'VARIABLE',
      frequency: 'ON_DEMAND',
    }),
    redeem: async () => {
      throw Object.assign(new Error('provider rejected Execute'), {
        providerCode: 'BAD_REQUEST',
        providerStatus: 400,
        providerDetailedCode: 'INVALID_REDEMPTION',
      });
    },
  };

  await assert.rejects(
    scheduler.executeDueRedemption(billing, now, {
      billingModel,
      provider,
      logger: { error: value => logs.push(value) },
    }),
    /provider rejected Execute/
  );

  const failureUpdate = updates.at(-1)[1].$set;
  assert.equal(failureUpdate['currentCycle.executeAttemptCount'], 1);
  assert.equal(failureUpdate['currentCycle.executeFailureCode'], 'BAD_REQUEST');
  assert.equal(failureUpdate['currentCycle.executeFailureStatus'], 400);
  assert.equal(failureUpdate['currentCycle.executeFailureDetailedCode'], 'INVALID_REDEMPTION');
  assert.equal(failureUpdate['currentCycle.executeFailureMessage'], 'provider rejected Execute');
  assert.equal(failureUpdate['currentCycle.executeRetryAt'].toISOString(), '2026-10-16T09:35:00.000Z');
  assert.match(logs[0], /action=execute_reconcile/);
  assert.doesNotMatch(logs[0], /provider rejected Execute/);
});

test('a reconciled REQUESTING redemption becomes retryable after backoff', async () => {
  const updates = [];
  const now = new Date('2026-10-16T09:40:00.000Z');
  const result = await scheduler.recoverOrExpireCycle({
    _id: 'user-execute-retry',
    currentCycle: {
      merchantOrderId: 'PPR_EXECUTE_RETRY',
      notifyState: 'NOTIFIED',
      redeemState: 'REQUESTING',
      executeAttemptCount: 1,
      executeRequestedAt: new Date('2026-10-16T09:30:00.000Z'),
      executeRetryAt: new Date('2026-10-16T09:35:00.000Z'),
      validUpto: new Date('2026-10-18T09:23:00.000Z'),
    },
  }, now, {
    billingModel: {
      updateOne: async (...args) => {
        updates.push(args);
        return { modifiedCount: 1 };
      },
    },
    orderModel: { updateOne: async () => assert.fail('a retryable cycle must not fail its order') },
  });

  assert.deepEqual(result, { retryable: true });
  assert.equal(updates[0][1].$set['currentCycle.redeemState'], 'RETRYABLE');
});

test('an expired redemption window is closed so a fresh Notify cycle can be reserved', async () => {
  const updates = [];
  const orderUpdates = [];
  const now = new Date('2026-10-19T09:30:00.000Z');
  const expiredBilling = {
    _id: 'user-expired-cycle',
    phase: 'active',
    cancelledAt: null,
    nextBillingAt: new Date('2026-10-16T09:23:00.000Z'),
    currentCycle: {
      sequence: 1,
      merchantOrderId: 'PPR_EXPIRED_1',
      notifyState: 'NOTIFIED',
      redeemState: 'REQUESTING',
      validUpto: new Date('2026-10-18T09:23:00.000Z'),
    },
  };
  const result = await scheduler.recoverOrExpireCycle(expiredBilling, now, {
    billingModel: {
      updateOne: async (...args) => {
        updates.push(args);
        return { modifiedCount: 1 };
      },
    },
    orderModel: { updateOne: async (...args) => orderUpdates.push(args) },
  });
  assert.deepEqual(result, { expired: true });
  assert.equal(updates[0][1].$set['currentCycle.redeemState'], 'EXPIRED');
  assert.equal(updates[0][1].$set['currentCycle.failureCode'], 'REDEMPTION_WINDOW_EXPIRED');
  assert.equal(orderUpdates[0][1].$set.status, 'failed');

  let reservePredicate;
  const fresh = await scheduler.reserveCycle({
    ...expiredBilling,
    currentCycle: { ...expiredBilling.currentCycle, redeemState: 'EXPIRED' },
  }, now, {
    billingModel: {
      findOneAndUpdate: async (predicate, update) => {
        reservePredicate = predicate;
        return { ...expiredBilling, currentCycle: update.$set.currentCycle };
      },
    },
  });
  assert.equal(reservePredicate['currentCycle.redeemState'], 'EXPIRED');
  assert.equal(fresh.currentCycle.sequence, 2);
  assert.equal(fresh.currentCycle.notifyState, 'REQUESTING');
  assert.match(fresh.currentCycle.merchantOrderId, /^PPR_2_/);
});

test('scheduler does not retry an uncertain notification outside the PhonePe retry window', async () => {
  const updates = [];
  const now = new Date('2026-10-14T13:14:00.000Z'); // 18:44 IST
  const result = await scheduler.processBilling({
    _id: 'user-notify-deferred',
    phase: 'active',
    cancelledAt: null,
    currentCycle: {
      merchantOrderId: 'PPR_NOTIFY_DEFERRED',
      notifyState: 'UNCERTAIN',
      redeemState: null,
    },
  }, now, {
    billingModel: {
      updateOne: async (...args) => updates.push(args),
      findById: async () => assert.fail('a deferred retry must stop processing'),
    },
    controller: {
      reconcileCycle: async () => assert.fail('PhonePe must not be called outside the retry window'),
    },
  });

  assert.equal(result.skipped, 'notify_retry_window');
  assert.equal(result.retryAt.toISOString(), '2026-10-14T16:01:00.000Z');
  assert.equal(updates[0][1].$set['currentCycle.notifyRetryAt'].toISOString(), '2026-10-14T16:01:00.000Z');
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

test('an uncertain renewal notification is retried after PhonePe confirms the order does not exist', async () => {
  const updates = [];
  const notifyCalls = [];
  const billing = {
    _id: 'user-renewal-1',
    merchantSubscriptionId: 'PPA_RENEWAL_1',
    currentCycle: {
      sequence: 1,
      merchantOrderId: 'PPR_RENEWAL_1',
      phonePeOrderId: null,
      notifyState: 'UNCERTAIN',
      redeemState: null,
    },
  };
  await standardController.reconcileCycle(billing, {
    provider: {
      getRedemptionOrderStatus: async () => {
        throw Object.assign(new Error('not found'), { providerCode: 'ORDER_NOT_FOUND', providerStatus: 400 });
      },
      getOrderStatus: async () => assert.fail('renewals must use the Custom Checkout order-status endpoint'),
      notifyRedemption: async (input) => {
        notifyCalls.push(input);
        return { orderId: 'PHONEPE_NOTIFY_RETRY_1', state: 'NOTIFICATION_IN_PROGRESS' };
      },
    },
    billingModel: { updateOne: async (...args) => updates.push(args) },
    orderModel: { updateOne: async () => assert.fail('a missing notification is not a failed debit') },
  });

  assert.deepEqual(notifyCalls, [{
    merchantOrderId: 'PPR_RENEWAL_1',
    merchantSubscriptionId: 'PPA_RENEWAL_1',
    userId: 'user-renewal-1',
    cycle: 1,
  }]);
  assert.equal(updates.length, 1);
  assert.equal(updates[0][0]['currentCycle.notifyState'], 'UNCERTAIN');
  assert.equal(updates[0][1].$set['currentCycle.phonePeOrderId'], 'PHONEPE_NOTIFY_RETRY_1');
  assert.equal(updates[0][1].$set['currentCycle.notifyState'], 'NOTIFICATION_IN_PROGRESS');
  assert.equal(updates[0][1].$set['currentCycle.notifyRetryAt'], null);
  assert.equal(updates[0][1].$set['currentCycle.notifyFailureCode'], null);
  assert.equal(updates[0][1].$set['currentCycle.notifyFailureStatus'], null);
  assert.equal(updates[0][1].$set['currentCycle.notifyFailureDetailedCode'], null);
  assert.equal(updates[0][1].$set['currentCycle.notifyFailureMessage'], null);
});

test('an uncertain renewal notification is not retried after an ambiguous status failure', async () => {
  const billing = {
    _id: 'user-renewal-2',
    merchantSubscriptionId: 'PPA_RENEWAL_2',
    currentCycle: {
      sequence: 1,
      merchantOrderId: 'PPR_RENEWAL_2',
      notifyState: 'UNCERTAIN',
      redeemState: null,
    },
  };
  await assert.rejects(
    standardController.reconcileCycle(billing, {
      provider: {
        getRedemptionOrderStatus: async () => {
          throw Object.assign(new Error('timeout'), { providerCode: 'TIMEOUT', providerStatus: 504 });
        },
        getOrderStatus: async () => assert.fail('renewals must use the Custom Checkout order-status endpoint'),
        notifyRedemption: async () => assert.fail('ambiguous requests must not be retried'),
      },
      billingModel: { updateOne: async () => assert.fail('billing must remain uncertain') },
      orderModel: { updateOne: async () => assert.fail('order must remain pending') },
    }),
    /timeout/
  );
});

test('new PhonePe web paths preserve Razorpay and mobile store integrations', () => {
  const paymentRoutes = fs.readFileSync(path.join(__dirname, '../routes/payment.js'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const frontend = fs.readFileSync(path.join(__dirname, '../../edunex-f/src/pages/PaymentPage.jsx'), 'utf8');
  assert.match(paymentRoutes, /router\.post\('\/webhooks\/razorpay', razorpay\.webhook\)/);
  assert.match(paymentRoutes, /router\.post\('\/webhooks\/phonepe\/autopay'/);
  assert.match(paymentRoutes, /standardPhonePe\.initiate/);
  assert.match(paymentRoutes, /\/payment\/phonepe\/autopay\/mobile\/order/);
  assert.match(paymentRoutes, /standardPhonePe\.initiateMobile/);
  assert.match(paymentRoutes, /PhonePeAutoPayBilling/);
  assert.match(server, /req\.path\.startsWith\('\/api\/webhooks\/phonepe'\)/);
  assert.match(server, /require\('\.\/routes\/appleIap'\)/);
  assert.match(server, /require\('\.\/routes\/googlePlayIap'\)/);
  assert.match(frontend, /window\.location\.assign\(data\.redirectUrl\)/);
  assert.match(frontend, /accessKind/);
  assert.match(frontend, /Trial subscription is active/);
  assert.match(fs.readFileSync(path.join(__dirname, '../controllers/phonePeStandardAutoPayController.js'), 'utf8'), /account\.access\.status !== 'trial'/);
});
