const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PhonePeEventClaim = require('../models/PhonePeEventClaim');
const OrderModel = require('../models/Order');
const SubscriptionModel = require('../models/Subscription');
const SubscriptionEventModel = require('../models/SubscriptionEvent');
const claims = require('../services/phonePeEventClaims');
const policy = require('../services/phonePePolicy');

function memoryClaimModel() {
  const records = new Map();
  let queue = Promise.resolve();
  function exclusive(work) {
    const result = queue.then(work);
    queue = result.catch(() => {});
    return result;
  }
  return {
    records,
    findOneAndUpdate(query, update) {
      return exclusive(() => {
        const current = records.get(query.eventKey);
        const retryable = !current
          || current.status === 'failed'
          || (current.status === 'processing' && current.leaseExpiresAt <= query.$or[1].leaseExpiresAt.$lte);
        if (!retryable) throw Object.assign(new Error('duplicate'), { code: 11000 });
        const next = {
          ...current,
          ...update.$setOnInsert,
          ...update.$set,
          attempts: Number(current?.attempts || 0) + 1,
        };
        records.set(query.eventKey, next);
        return { ...next };
      });
    },
    async findOne(query) {
      const record = records.get(query.eventKey);
      return record ? { ...record } : null;
    },
    async updateOne(query, update) {
      return exclusive(() => {
        const current = records.get(query.eventKey);
        if (!current || current.leaseToken !== query.leaseToken || current.status !== query.status) {
          return { matchedCount: 0, modifiedCount: 0 };
        }
        records.set(query.eventKey, { ...current, ...update.$set });
        return { matchedCount: 1, modifiedCount: 1 };
      });
    },
  };
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    location: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    sendStatus(code) { this.statusCode = code; return this; },
    redirect(location) { this.statusCode = 302; this.location = location; return this; },
  };
}

function controllerHarness({ env = {}, failFirstOrderSave = false, providerStatus = null, orderType = 'subscription_charge' } = {}) {
  const counters = {
    orderFind: 0,
    orderSave: 0,
    subscriptionSave: 0,
    userUpdate: 0,
    eventCreate: 0,
    providerVerify: 0,
    subscriptionUpdate: null,
    userFields: null,
  };
  const logs = [];
  let shouldFailOrderSave = failFirstOrderSave;
  const order = {
    _id: 'order-1',
    user: 'user-1',
    subscription: 'subscription-1',
    orderType,
    totalAmount: orderType === 'one_time_access' ? 49900 : 50000,
    gateway: 'phonepe',
    status: 'pending',
    phonePeMerchantTransactionId: 'merchant-1',
    phonePePaymentInstrument: null,
    phonePeCustomerId: null,
    paidAt: null,
    async save() {
      counters.orderSave += 1;
      if (shouldFailOrderSave) {
        shouldFailOrderSave = false;
        throw new Error('database interrupted aws-private-secret');
      }
    },
  };
  const subscription = {
    _id: 'subscription-1',
    user: 'user-1',
    gateway: 'phonepe',
    status: 'trial',
    phonePeMandateId: null,
    async save() { counters.subscriptionSave += 1; },
  };
  const models = {
    Order: {
      async findOne(query = {}) {
        counters.orderFind += 1;
        return query.orderType && query.orderType !== order.orderType ? null : order;
      },
      async findByIdAndUpdate() {},
      async create() { throw new Error('new PhonePe order must not be created'); },
    },
    Subscription: {
      async exists() { return false; },
      async findById() { return subscription; },
      async findOne() { return subscription; },
      async findOneAndUpdate(_query, update) { counters.subscriptionUpdate = update; return subscription; },
    },
    SubscriptionEvent: {
      async findOne() { return null; },
      async create(value) { counters.eventCreate += 1; return value; },
    },
    User: {
      async findByIdAndUpdate(_id, fields) { counters.userUpdate += 1; counters.userFields = fields; },
    },
  };
  const claimStates = new Map();
  const claimService = {
    callbackEventIdentity: claims.callbackEventIdentity,
    webhookEventIdentity: claims.webhookEventIdentity,
    async claimPhonePeEvent(input) {
      const current = claimStates.get(input.eventKey);
      if (current && current.status !== 'failed') return { acquired: false, eventKey: input.eventKey, status: current.status };
      const claim = { acquired: true, eventKey: input.eventKey, leaseToken: `lease-${Number(current?.attempts || 0) + 1}` };
      claimStates.set(input.eventKey, { status: 'processing', attempts: Number(current?.attempts || 0) + 1, claim });
      return claim;
    },
    async markPhonePeEventProcessed(claim) {
      claimStates.set(claim.eventKey, { ...claimStates.get(claim.eventKey), status: 'processed' });
    },
    async markPhonePeEventFailed(claim) {
      if (claim?.eventKey) claimStates.set(claim.eventKey, { ...claimStates.get(claim.eventKey), status: 'failed' });
    },
  };
  const phonePeService = {
    oneTimeAccessDays: 30,
    oneTimeAmountPaise: 49900,
    readiness: () => ({ configured: true }),
    verifyWebhookSignature: () => true,
    async verifyPaymentStatus() {
      counters.providerVerify += 1;
      return providerStatus || { success: true, state: 'COMPLETED', transactionId: 'provider-transaction-1', paymentInstrument: 'UPI', raw: {} };
    },
  };
  const sandboxProcess = { env: {
    NODE_ENV: 'production',
    PAYMENT_GATEWAY_MODE: 'razorpay',
    PHONEPE_ENABLED: 'true',
    PHONEPE_NEW_PAYMENTS_ENABLED: 'false',
    ...env,
  } };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controllers/paymentController.js'), 'utf8'), {
    module,
    exports: module.exports,
    Buffer,
    Date,
    URL,
    process: sandboxProcess,
    console: {
      error: (message) => logs.push(String(message)),
      warn: (message) => logs.push(String(message)),
      log: () => {},
    },
    require(name) {
      if (name.includes('phonePeEventClaims')) return claimService;
      if (name.includes('phonePePolicy')) return {
        isPhonePeEnabled: candidate => policy.isPhonePeEnabled(candidate),
        isPhonePeNewPaymentsEnabled: candidate => policy.isPhonePeNewPaymentsEnabled(candidate),
      };
      if (name.includes('phonePeService')) return phonePeService;
      if (name.includes('paymentMode')) return { activeProvider: async () => policy.newCheckoutProvider(sandboxProcess.env) === 'phonepe' ? 'phonepe' : 'razorpay' };
      if (name.includes('subscriptionAccess')) return { resolveSubscriptionAccess: () => ({ active: false, status: 'expired', expiresAt: null }) };
      if (name.includes('courseAccess')) return { activeCourseEntitlements: () => [] };
      if (name.includes('trialEligibility')) return { hasUsedIntroTrial: async () => false };
      return models[name.split('/').at(-1)];
    },
  });
  return { handlers: module.exports, counters, logs, order, subscription, claimStates };
}

function webhookRequest() {
  return {
    headers: { 'x-verify': 'valid' },
    body: Buffer.from(JSON.stringify({
      event: 'PAYMENT_SUCCESS',
      data: {
        merchantTransactionId: 'merchant-1',
        transactionId: 'provider-transaction-1',
        amount: 50000,
        paymentInstrument: 'UPI',
      },
    })),
  };
}

test('atomic claim allows only one concurrent owner and retries a failed owner', async () => {
  const model = memoryClaimModel();
  const input = { eventKey: 'phonepe:test', source: 'webhook', eventType: 'PAYMENT_SUCCESS' };
  const [first, second] = await Promise.all([
    claims.claimPhonePeEvent(input, { model, tokenFactory: () => 'lease-1' }),
    claims.claimPhonePeEvent(input, { model, tokenFactory: () => 'lease-2' }),
  ]);
  assert.equal([first, second].filter(item => item.acquired).length, 1);
  const owner = first.acquired ? first : second;
  await claims.markPhonePeEventFailed(owner, 'test_failure', { model });
  const retry = await claims.claimPhonePeEvent(input, { model, tokenFactory: () => 'lease-3' });
  assert.equal(retry.acquired, true);
  await claims.markPhonePeEventProcessed(retry, { model });
  const duplicate = await claims.claimPhonePeEvent(input, { model, tokenFactory: () => 'lease-4' });
  assert.equal(duplicate.acquired, false);
  assert.equal(model.records.get(input.eventKey).status, 'processed');
});

test('claim path ensures the unique event-key index before accepting work', async () => {
  const model = memoryClaimModel();
  let indexCalls = 0;
  model.collection = {
    async createIndex(keys, options) {
      indexCalls += 1;
      assert.deepEqual(keys, { eventKey: 1 });
      assert.equal(options.unique, true);
    },
  };
  const input = { eventKey: 'phonepe:index-test', source: 'webhook', eventType: 'MANDATE_APPROVED' };
  await claims.claimPhonePeEvent(input, { model, tokenFactory: () => 'lease-index-1' });
  await claims.claimPhonePeEvent(input, { model, tokenFactory: () => 'lease-index-2' });
  assert.equal(indexCalls, 1);
});

test('callback and payment webhook share one stable provider-payment identity', () => {
  const callback = claims.callbackEventIdentity('merchant-1');
  const webhook = claims.webhookEventIdentity({ event: 'PAYMENT_SUCCESS', merchantTransactionId: 'merchant-1', phonePeTransactionId: 'provider-1' });
  assert.equal(callback, webhook);
  assert.match(callback, /^phonepe:payment:[a-f0-9]{64}$/);
});

test('same PhonePe webhook on two instances applies payment side effects once', async () => {
  const flow = controllerHarness();
  const first = responseRecorder();
  const duplicate = responseRecorder();
  await Promise.all([
    flow.handlers.handleWebhook(webhookRequest(), first),
    flow.handlers.handleWebhook(webhookRequest(), duplicate),
  ]);
  assert.equal(first.statusCode, 200);
  assert.equal(duplicate.statusCode, 200);
  assert.equal(flow.counters.orderSave, 1);
  assert.equal(flow.counters.subscriptionSave, 1);
  assert.equal(flow.counters.eventCreate, 1);
  assert.equal(flow.order.status, 'paid');
});

test('same callback on two instances has one atomic owner and one provider verification', async () => {
  const flow = controllerHarness();
  flow.order.orderType = 'refund';
  const request = { query: { merchantTransactionId: 'merchant-1' } };
  const first = responseRecorder();
  const duplicate = responseRecorder();
  await Promise.all([
    flow.handlers.paymentCallback(request, first),
    flow.handlers.paymentCallback(request, duplicate),
  ]);
  assert.equal(flow.counters.providerVerify, 1);
  assert.equal(flow.counters.orderSave, 1);
  assert.equal(first.statusCode, 302);
  assert.equal(duplicate.statusCode, 302);
});

test('one-time PhonePe payment grants 30 days without creating a mandate', async () => {
  const flow = controllerHarness({ orderType: 'one_time_access', providerStatus: {
    success: true, state: 'COMPLETED', amount: 49900,
    transactionId: 'provider-transaction-1', paymentInstrument: 'UPI', raw: {},
  } });
  const response = responseRecorder();
  await flow.handlers.paymentCallback({ query: { merchantTransactionId: 'merchant-1' } }, response);
  assert.equal(response.statusCode, 302);
  assert.equal(flow.order.status, 'paid');
  assert.equal(flow.counters.subscriptionUpdate.$set.frequency, 'once');
  assert.equal(flow.counters.subscriptionUpdate.$set.phonePeMandateId, null);
  assert.equal(flow.counters.subscriptionUpdate.$set.nextBillingAt, null);
  assert.equal(flow.counters.subscriptionUpdate.$set.amount, 49900);
  assert.equal(flow.counters.subscriptionUpdate.$set.currentPeriodEnd.getTime() - flow.order.paidAt.getTime(), 30 * 24 * 60 * 60 * 1000);
  assert.equal(flow.counters.userFields.subscriptionExpiry.getTime(), flow.counters.subscriptionUpdate.$set.currentPeriodEnd.getTime());
});

test('standard checkout webhook confirms the one-time order from PhonePe status', async () => {
  const flow = controllerHarness({ orderType: 'one_time_access', providerStatus: {
    success: true, state: 'COMPLETED', amount: 49900,
    transactionId: 'provider-transaction-1', paymentInstrument: 'UPI', raw: {},
  } });
  const webhook = responseRecorder();
  await flow.handlers.handleWebhook({
    headers: { authorization: 'valid' },
    body: Buffer.from(JSON.stringify({
      event: 'checkout.order.completed',
      payload: { merchantOrderId: 'merchant-1', state: 'COMPLETED', amount: 49900, paymentDetails: [{ transactionId: 'provider-transaction-1' }] },
    })),
  }, webhook);
  assert.equal(webhook.statusCode, 200);
  assert.equal(flow.counters.providerVerify, 1);
  assert.equal(flow.order.status, 'paid');
  assert.equal(flow.counters.subscriptionUpdate.$set.frequency, 'once');
});

test('PhonePe amount mismatch never grants one-time access', async () => {
  const flow = controllerHarness({ orderType: 'one_time_access', providerStatus: {
    success: true, state: 'COMPLETED', amount: 100,
    transactionId: 'provider-transaction-1', paymentInstrument: 'UPI', raw: {},
  } });
  const response = responseRecorder();
  await flow.handlers.paymentCallback({ query: { merchantTransactionId: 'merchant-1' } }, response);
  assert.equal(response.statusCode, 503);
  assert.equal(flow.order.status, 'pending');
  assert.equal(flow.counters.subscriptionUpdate, null);
});

test('failed processing returns retryable status, is not marked successful, and logs no secret', async () => {
  const flow = controllerHarness({ failFirstOrderSave: true });
  const first = responseRecorder();
  await flow.handlers.handleWebhook(webhookRequest(), first);
  const eventKey = claims.callbackEventIdentity('merchant-1');
  assert.equal(first.statusCode, 503);
  assert.equal(flow.claimStates.get(eventKey).status, 'failed');
  assert.ok(!flow.logs.join(' ').includes('aws-private-secret'));

  const retry = responseRecorder();
  await flow.handlers.handleWebhook(webhookRequest(), retry);
  assert.equal(retry.statusCode, 200);
  assert.equal(flow.claimStates.get(eventKey).status, 'processed');
  assert.equal(flow.counters.eventCreate, 1);
});

test('nonterminal callback state remains retryable for a later provider success event', async () => {
  const flow = controllerHarness({ providerStatus: { success: false, state: 'PENDING', transactionId: 'provider-transaction-1', raw: {} } });
  const res = responseRecorder();
  await flow.handlers.paymentCallback({ query: { merchantTransactionId: 'merchant-1' } }, res);
  const eventKey = claims.callbackEventIdentity('merchant-1');
  assert.equal(res.statusCode, 503);
  assert.equal(flow.claimStates.get(eventKey).status, 'failed');
  assert.equal(flow.counters.orderSave, 0);
});

test('production kill switch blocks new PhonePe checkout before creating an order', async () => {
  const flow = controllerHarness({ env: { PAYMENT_GATEWAY_MODE: 'phonepe', PHONEPE_ENABLED: 'false', PHONEPE_NEW_PAYMENTS_ENABLED: 'true' } });
  const res = responseRecorder();
  await flow.handlers.initiateTrial({ body: {}, user: { _id: 'user-1' } }, res);
  assert.equal(res.statusCode, 410);
  assert.match(res.body.error, /no longer available/i);
  assert.equal(flow.counters.orderFind, 0);
});

test('disabled PhonePe callback and webhook return before all side effects', async () => {
  const flow = controllerHarness({ env: { PAYMENT_GATEWAY_MODE: 'phonepe', PHONEPE_ENABLED: 'false', PHONEPE_NEW_PAYMENTS_ENABLED: 'true' } });
  const callback = responseRecorder();
  const webhook = responseRecorder();

  await flow.handlers.paymentCallback({ query: { merchantTransactionId: 'merchant-1' } }, callback);
  await flow.handlers.handleWebhook(webhookRequest(), webhook);

  assert.equal(callback.statusCode, 410);
  assert.equal(webhook.statusCode, 410);
  assert.deepEqual(flow.counters, {
    orderFind: 0,
    orderSave: 0,
    subscriptionSave: 0,
    userUpdate: 0,
    eventCreate: 0,
    providerVerify: 0,
    subscriptionUpdate: null,
    userFields: null,
  });
  assert.equal(flow.claimStates.size, 0);
});

test('all payment routing fails closed for missing or unknown mode while Razorpay stays explicit', () => {
  assert.equal(policy.newCheckoutProvider({ NODE_ENV: 'production', PAYMENT_GATEWAY_MODE: 'razorpay' }), 'razorpay');
  assert.equal(policy.newCheckoutProvider({ NODE_ENV: 'production', PAYMENT_GATEWAY_MODE: 'phonepe' }), 'disabled');
  assert.equal(policy.newCheckoutProvider({ NODE_ENV: 'production', PAYMENT_GATEWAY_MODE: 'phonepe', PHONEPE_ENABLED: 'false', PHONEPE_NEW_PAYMENTS_ENABLED: 'true' }), 'disabled');
  assert.equal(policy.newCheckoutProvider({ NODE_ENV: 'production', PAYMENT_GATEWAY_MODE: 'phonepe', PHONEPE_ENABLED: 'true', PHONEPE_NEW_PAYMENTS_ENABLED: 'true' }), 'phonepe');
  assert.equal(policy.newCheckoutProvider({ NODE_ENV: 'production', PAYMENT_GATEWAY_MODE: 'unknown' }), 'disabled');
  assert.equal(policy.newCheckoutProvider({ NODE_ENV: 'production' }), 'disabled');
});

test('legacy callback fields remain readable and claim key has a unique index', () => {
  for (const field of ['gateway', 'phonePeMerchantTransactionId', 'phonePeTransactionId', 'phonePeCustomerId']) {
    assert.ok(OrderModel.schema.path(field));
  }
  for (const field of ['gateway', 'phonePeSubscriptionId', 'phonePeMandateId', 'phonePeAuthRequestId']) {
    assert.ok(SubscriptionModel.schema.path(field));
  }
  assert.ok(SubscriptionEventModel.schema.path('phonePeTransactionId'));
  assert.ok(PhonePeEventClaim.schema.indexes().some(([keys, options]) => keys.eventKey === 1 && options.unique === true));
});
