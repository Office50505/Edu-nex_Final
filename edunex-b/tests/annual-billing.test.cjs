const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const rzp = require('../services/razorpayService');
const c = { mode: 'live', annualPlanId: 'plan_annual', annualAmount: 499900, annualCycles: 10, planId: 'plan_monthly', monthlyAmount: 49900, cycles: 120, trialAmount: 100, trialHours: 24 };
const plan = { id: c.annualPlanId, period: 'yearly', interval: 1, item: { currency: 'INR', amount: 499900 } };
test('annual payload charges the yearly plan immediately without trial addons', () => {
  const payload = rzp.createPayload(c, 'annual', 'attempt');
  assert.equal(payload.plan_id, 'plan_annual'); assert.equal(payload.total_count, 10);
  assert.equal(payload.start_at, undefined); assert.equal(payload.addons, undefined);
  assert.equal(rzp.createPayload(c, 'trial', 'attempt').plan_id, 'plan_monthly');
});
test('annual plan validation rejects monthly interval, wrong price/currency and wrong plan identity', () => {
  assert.doesNotThrow(() => rzp.validatePlan(plan, c, 'annual'));
  for (const change of [{ period: 'monthly' }, { interval: 2 }, { id: 'other' }, { item: { amount: 49900, currency: 'INR' } }, { item: { amount: 499900, currency: 'USD' } }]) {
    assert.throws(() => rzp.validatePlan({ ...plan, ...change }, c, 'annual'));
  }
});
test('annual entitlement uses paid invoice dates, survives cancellation and rejects refunds or wrong amounts', () => {
  const now = Date.now(); const end = Math.floor(now / 1000) + 366 * 86400;
  const billing = { paymentType: 'annual', recurringAmount: 499900, monthlyAmount: 49900 };
  const item = { invoice: { billing_start: Math.floor(now / 1000) - 60, billing_end: end }, payment: { status: 'captured', currency: 'INR', amount: 499900 } };
  const result = rzp.entitlement(billing, { status: 'cancelled' }, [item], now);
  assert.equal(result.status, 'active'); assert.equal(result.subscriptionType, 'annual'); assert.equal(+result.currentPeriodEnd, end * 1000);
  for (const payment of [{ ...item.payment, amount: 49900 }, { ...item.payment, status: 'authorized' }, { ...item.payment, amount_refunded: 499900 }]) {
    assert.notEqual(rzp.entitlement(billing, { status: 'active' }, [{ ...item, payment }], now).status, 'active');
  }
  assert.equal(rzp.entitlement(billing, { status: 'active' }, [item], end * 1000 + 1).status, 'expired');
});
function controller({ pending = null, remotePlan = plan } = {}) {
  let billing = pending, created, recorded;
  const models = {
    RazorpayBilling: { findById: async () => billing, findOneAndUpdate: async (_q, update) => { recorded = { ...recorded, ...update.$set }; billing = { _id: 'u', ...recorded }; return billing; } },
    Subscription: { findOne: async () => null }, Order: { exists: async () => false },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controllers/razorpayController.js'), 'utf8'), {
    module, exports: module.exports, Date, Buffer,
    require(name) {
      if (name === 'node:crypto') return crypto;
      if (name.includes('paymentMode')) return { activeMode: async () => 'live' };
      if (name.includes('razorpayService')) return { ...rzp, config: () => c, requireConfig: () => c, api: async (route, method, body) => {
        if (route.startsWith('/plans/')) return remotePlan;
        if (method === 'POST') { created = body; return { id: 'sub_annual' }; }
        return { status: 'created' };
      } };
      return models[name.split('/').at(-1)] || {};
    },
  });
  return { async initiate(type) {
    let status = 200, data;
    await module.exports.initiate({ user: { _id: 'u', isMobileVerified: true }, body: { paymentType: type, mandateConsent: true, amount: 1, planId: 'attacker_plan' } }, { status(s) { status = s; return this; }, json(d) { data = d; } });
    return { status, data, created, recorded };
  } };
}
test('annual checkout selects server-owned plan/price and returns annual checkout metadata', async () => {
  const result = await controller().initiate('annual');
  assert.equal(result.status, 201); assert.equal(result.created.plan_id, c.annualPlanId);
  assert.equal(result.recorded.recurringAmount, 499900); assert.equal(result.recorded.paymentType, 'annual');
  assert.equal(result.recorded.trialEnd, null); assert.equal(result.data.paymentType, 'annual');
});
test('pending monthly checkout cannot be reused as annual; invalid types and wrong plans cannot create mandates', async () => {
  const pending = await controller({ pending: { mode: 'live', phase: 'ready', paymentType: 'monthly', subscriptionId: 'sub_old' } }).initiate('annual');
  assert.equal(pending.status, 409); assert.equal(pending.created, undefined);
  const invalid = await controller().initiate('unknown'); assert.equal(invalid.status, 400);
  const wrong = await controller({ remotePlan: { ...plan, period: 'monthly' } }).initiate('annual');
  assert.equal(wrong.status, 503); assert.equal(wrong.created, undefined);
});
test('Live annual configuration never leaks into Test mode', () => {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/razorpayService.js'), 'utf8'), {
    module, require: () => crypto, process: { env: {
      RAZORPAY_LIVE_KEY_ID: 'rzp_live_example', RAZORPAY_LIVE_KEY_SECRET: 'secret', RAZORPAY_LIVE_WEBHOOK_SECRET: 'hook', RAZORPAY_LIVE_ANNUAL_PLAN_ID: c.annualPlanId,
      RAZORPAY_TEST_KEY_ID: 'rzp_test_example', RAZORPAY_TEST_KEY_SECRET: 'testsecret', RAZORPAY_TEST_WEBHOOK_SECRET: 'testhook', RAZORPAY_TEST_PLAN_ID: 'monthly_test',
    } },
  });
  assert.equal(module.exports.requireConfig('live', 'annual').annualPlanId, c.annualPlanId);
  assert.throws(() => module.exports.requireConfig('test', 'annual'), /annual plan ID/);
  assert.equal(module.exports.requireConfig('test', 'monthly').planId, 'monthly_test');
});
