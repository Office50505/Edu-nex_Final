const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { validSignature, createPayload, entitlement } = require('../services/razorpayService');
const { hasTrialHistoryMarker, hasUsedIntroTrial } = require('../services/trialEligibility');
const { resolveSubscriptionAccess } = require('../services/subscriptionAccess');
const now = Date.now();
const billing = { paymentType: 'trial', trialAmount: 100, monthlyAmount: 50000, trialEnd: new Date(now + 86400000) };
const remote = { status: 'authenticated' };
const trial = { invoice: {}, payment: { status: 'captured', currency: 'INR', amount: 100, created_at: Math.floor(now / 1000) } };
const monthly = { invoice: { billing_start: Math.floor(now / 1000) - 100, billing_end: Math.floor(now / 1000) + 86400 }, payment: { status: 'captured', currency: 'INR', amount: 50000, created_at: Math.floor(now / 1000) } };

test('Checkout HMAC uses payment ID followed by server-owned subscription ID', () => {
  const signature = crypto.createHmac('sha256', 'test-secret').update('pay_1|sub_1').digest('hex');
  assert.equal(validSignature('pay_1|sub_1', signature, 'test-secret'), true);
  assert.equal(validSignature('pay_1|sub_other', signature, 'test-secret'), false);
  assert.equal(validSignature('pay_1|sub_1', 'bad', 'test-secret'), false);
});
test('raw webhook bytes must match exactly', () => {
  const raw = Buffer.from('{ "event": "subscription.charged" }');
  const sig = crypto.createHmac('sha256', 'webhook-secret').update(raw).digest('hex');
  assert.equal(validSignature(raw, sig, 'webhook-secret'), true);
  assert.equal(validSignature(JSON.stringify(JSON.parse(raw)), sig, 'webhook-secret'), false);
});
test('trial creates upfront fee and future billing; direct monthly has no extra trial charge', () => {
  const c = { planId: 'plan_test', trialAmount: 100, trialHours: 24, cycles: 120 };
  const payload = createPayload(c, 'trial', 'attempt', now);
  assert.equal(payload.addons[0].item.amount, 100);
  assert.equal(payload.start_at, Math.floor(now / 1000) + 86400);
  assert.ok(payload.expire_by < payload.start_at);
  assert.equal(createPayload(c, 'monthly', 'attempt', now).addons, undefined);
});
test('mandate authorization alone and uncaptured payments grant no access', () => {
  assert.equal(entitlement(billing, remote, [], now).status, 'pending');
  assert.equal(entitlement(billing, remote, [{ ...trial, payment: { ...trial.payment, status: 'authorized' } }], now).status, 'pending');
});
test('captured trial access expires at scheduled first billing', () => {
  assert.equal(entitlement(billing, remote, [trial], now).status, 'trial');
  assert.notEqual(entitlement(billing, remote, [trial], now + 86400001).status, 'trial');
});
test('cancelling auto-renew keeps the already-paid trial until it expires', () => {
  assert.equal(entitlement(billing, { status: 'cancelled' }, [trial], now).status, 'trial');
  assert.notEqual(entitlement(billing, { status: 'cancelled' }, [trial], now + 86400001).status, 'trial');
});
test('the introductory trial is permanently marked as used by account history or a paid trial order', async () => {
  assert.equal(hasTrialHistoryMarker({ trialStartedAt: new Date(now) }), true);
  assert.equal(hasTrialHistoryMarker({ status: 'expired' }, { subscriptionStatus: '1rs trial' }), true);
  assert.equal(await hasUsedIntroTrial('learner', { status: 'expired' }, {}, { exists: async query => query.orderType === 'trial_charge' && query.status === 'paid' }), true);
  assert.equal(await hasUsedIntroTrial('learner', { status: 'expired' }, {}, { exists: async () => null }), false);
});
test('renewal requires a paid current-period invoice; stale events cannot extend access', () => {
  assert.equal(entitlement(billing, { status: 'active' }, [], now).status, 'expired');
  assert.equal(entitlement(billing, { status: 'active' }, [monthly], now).status, 'active');
  assert.equal(entitlement(billing, { status: 'active' }, [monthly], now + 86401000).status, 'expired');
});
test('cancellation retains already-paid time; full refunds revoke it and partial refunds do not', () => {
  assert.equal(entitlement(billing, { status: 'cancelled' }, [monthly], now).status, 'active');
  assert.equal(entitlement(billing, remote, [{ ...monthly, payment: { ...monthly.payment, amount_refunded: 50000 } }], now).status, 'pending');
  assert.equal(entitlement(billing, remote, [{ ...monthly, payment: { ...monthly.payment, amount_refunded: 100 } }], now).status, 'active');
});
test('an expired mandate does not revoke a paid monthly period that has not ended', () => {
  const access = resolveSubscriptionAccess({ status: 'expired', subscriptionType: 'monthly', currentPeriodEnd: new Date(now + 86400000) }, {}, now);
  assert.equal(access.active, true);
  assert.equal(access.status, 'active');
});
test('wrong currency and wrong amount cannot unlock access', () => {
  for (const change of [{ currency: 'USD' }, { amount: 1 }]) assert.notEqual(entitlement(billing, remote, [{ ...monthly, payment: { ...monthly.payment, ...change } }], now).status, 'active');
});
function controller(billing = {}) {
  const module = { exports: {} }; let upstreamCalls = 0;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controllers/razorpayController.js'), 'utf8'), {
    module, exports: module.exports, Buffer, Date, console,
    require(name) {
      if (name === 'node:crypto') return crypto;
      if (name.includes('razorpayService')) return { validSignature, legacyMode: () => 'test', config: (mode = 'test') => ({ webhookSecret: mode === 'test' ? 'secret' : 'live-secret' }), requireConfig: () => ({ secret: 'secret' }), api: () => { upstreamCalls++; } };
      if (name.includes('trialEligibility')) return { hasUsedIntroTrial: async () => false };
      if (name.includes('subscriptionAccess')) return { resolveSubscriptionAccess };
      return { findById: async () => billing };
    },
  });
  return { handlers: module.exports, calls: () => upstreamCalls };
}
test('forged webhook and a different users subscription callback are rejected before provider calls', async () => {
  const { handlers, calls } = controller({ subscriptionId: 'sub_owner' });
  let status;
  const res = { status(value) { status = value; return this; }, json() {} };
  await handlers.webhook({ body: Buffer.from('{}'), get: () => 'forged' }, res);
  assert.equal(status, 400);
  await handlers.verify({ user: { _id: 'owner' }, body: { razorpay_subscription_id: 'sub_other', razorpay_payment_id: 'pay_1' } }, res);
  assert.equal(status, 400);
  assert.equal(calls(), 0);
});

function flow(mode = 'test') {
  const billing = { _id: 'learner', mode, phase: 'ready', subscriptionId: 'sub_test', ...globalBilling() };
  let local; let providerCalls = 0; let failWrite = false; const processed = new Map();
  const upstream = { id: 'sub_test', status: 'active', charge_at: Math.floor(now / 1000) + 86400 };
  const invoice = { id: 'inv_test', subscription_id: 'sub_test', status: 'paid', payment_id: 'pay_test', ...monthly.invoice };
  const models = {
    RazorpayBilling: { findById: async () => billing, findOne: async () => billing,
      async findOneAndUpdate(query, update) { if (billing.lease) return null; Object.assign(billing, update.$set); return billing; },
      async updateOne(query, update) { if (query.lease && query.lease !== billing.lease) return; Object.assign(billing, update.$set || {}); for (const key of Object.keys(update.$unset || {})) delete billing[key]; } },
    BillingWebhook: { findById: async id => processed.get(id), updateOne: async (query, update) => processed.set(query._id, update.$set) },
    Subscription: { findOneAndUpdate: async (query, update) => { local = { _id: 'local', ...update.$setOnInsert, ...update.$set }; return local; } },
    Order: { updateOne: async () => { if (failWrite) { failWrite = false; throw new Error('database write interrupted'); } } },
    User: { findByIdAndUpdate: async () => {} },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controllers/razorpayController.js'), 'utf8'), { module, exports: module.exports, Buffer, Date, console,
    require(name) {
      if (name === 'node:crypto') return crypto;
      if (name.includes('razorpayService')) return { validSignature, entitlement, legacyMode: () => 'test', config: (mode = 'test') => ({ webhookSecret: mode === 'test' ? 'secret' : 'live-secret' }), api: async route => {
        providerCalls++;
        if (route.startsWith('/subscriptions/')) return upstream;
        if (route.startsWith('/invoices?')) return { items: [invoice] };
        return { id: 'pay_test', ...monthly.payment };
      } };
      if (name.includes('trialEligibility')) return { hasUsedIntroTrial: async () => false };
      if (name.includes('subscriptionAccess')) return { resolveSubscriptionAccess };
      return models[name.split('/').at(-1)];
    },
  });
  return { billing, processed, local: () => local, calls: () => providerCalls, interrupt() { failWrite = true; }, async event(id = 'event1', signedMode = mode, eventName = 'subscription.charged') {
    const body = Buffer.from(JSON.stringify({ event: eventName, payload: { subscription: { entity: { id: 'sub_test' } } } }));
    const sig = crypto.createHmac('sha256', signedMode === 'live' ? 'live-secret' : 'secret').update(body).digest('hex');
    let status = 200;
    await module.exports.webhook({ body, get: key => key === 'x-razorpay-signature' ? sig : id }, { status(value) { status = value; return this; }, json() {} });
    return status;
  } };
}
function globalBilling() { return { paymentType: 'monthly', trialAmount: 100, monthlyAmount: 50000 }; }
test('duplicate signed webhooks grant one period and do not refetch or extend it', async () => {
  const f = flow(); assert.equal(await f.event(), 200); const calls = f.calls();
  assert.equal(f.local().status, 'active'); assert.equal(await f.event(), 200); assert.equal(f.calls(), calls);
  assert.equal(f.local().currentPeriodEnd.getTime(), monthly.invoice.billing_end * 1000);
});
test('interrupted writes leave events retryable and release the reconciliation lease', async () => {
  const f = flow(); f.interrupt(); assert.equal(await f.event(), 500);
  assert.equal(f.processed.size, 0); assert.equal(f.billing.lease, undefined);
  assert.equal(await f.event(), 200); assert.equal(f.processed.size, 1);
});

test('live webhooks reconcile with live credentials and cross-mode events are rejected', async () => {
  const f = flow('live');
  assert.equal(await f.event('wrong-mode', 'test'), 400);
  assert.equal(f.calls(), 0);
  assert.equal(await f.event('live-event', 'live'), 200);
  assert.equal(f.local().razorpayMode, 'live');
});

for (const event of ['subscription.activated', 'subscription.charged', 'subscription.pending', 'subscription.halted', 'subscription.cancelled', 'subscription.completed', 'payment.failed']) {
  test(`${event} reconciles signed events against provider data, rather than event labels`, async () => {
    const f = flow();
    assert.equal(await f.event(event, 'test', event), 200);
    assert.ok(f.calls() > 0);
    assert.equal(f.local().currentPeriodEnd.getTime(), monthly.invoice.billing_end * 1000);
    assert.equal(f.processed.size, 1);
  });
}
