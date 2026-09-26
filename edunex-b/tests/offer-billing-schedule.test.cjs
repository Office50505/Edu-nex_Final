const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const service = require('../services/razorpayService');

function setup({ invalidSchedule = false, existing = null } = {}) {
  const calls = [];
  let record = existing;
  const config = { mode: 'live', planId: 'plan_monthly', monthlyAmount: 49900, trialAmount: 100, trialHours: 24, cycles: 120 };
  const models = {
    RazorpayBilling: {
      findById: async () => record,
      findOneAndUpdate: async (_, update) => { record = { _id: 'user', ...record, ...update.$set }; return record; },
      updateOne: async (_, update) => { Object.assign(record, update.$set); },
    },
    Subscription: { findOne: async () => null },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../controllers/razorpayController'), 'utf8'), {
    module, exports: module.exports, Date, Buffer, console,
    require(name) {
      if (name === 'node:crypto') return crypto;
      if (name.includes('razorpayService')) return {
        ...service, requireConfig: () => config, config: () => config,
        api: async (route, method, payload) => {
          calls.push({ route, method, payload });
          if (route.startsWith('/plans/')) return { id: 'plan_monthly', period: 'monthly', interval: 1, item: { amount: 49900, currency: 'INR' } };
          if (method === 'POST') return { id: 'sub_new', start_at: invalidSchedule ? null : payload.start_at };
          return { id: record.subscriptionId, status: 'created', start_at: new Date(record.trialEnd).getTime() / 1000, expire_by: Math.ceil(Date.now() / 1000) + 600 };
        },
      };
      if (name.includes('trialEligibility')) return { hasUsedIntroTrial: async () => false };
      if (name.includes('paymentMode')) return { activeMode: async () => 'live' };
      if (name.includes('subscriptionAccess')) return {};
      return models[name.split('/').at(-1)] || {};
    },
  });
  return { calls, get record() { return record; }, async initiate(body = {}, user = {}) {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
    await module.exports.initiate({ onboarding: {}, onboardingMode: 'live', user: { _id: 'user', isMobileVerified: true, ...user }, body: { mandateConsent: true, paymentType: 'trial', ...body } }, res);
    return res;
  } };
}

test('new offer mandates preserve 24 hours after the last allowed checkout second', async () => {
  const f = setup(); const response = await f.initiate();
  assert.equal(response.code, 201);
  const created = f.calls.find(call => call.method === 'POST').payload;
  assert.equal(created.start_at - created.expire_by, 86400);
  assert.equal(created.addons[0].item.amount, 100);
  assert.equal(f.record.trialEnd.getTime(), created.start_at * 1000);
});
test('a provider schedule mismatch is not exposed to the customer and retains the upstream ID', async () => {
  const f = setup({ invalidSchedule: true }); const response = await f.initiate();
  assert.equal(response.code, 503);
  assert.equal(response.data.subscriptionId, undefined);
  assert.equal(f.record.subscriptionId, 'sub_new');
  assert.equal(f.record.phase, 'uncertain');
});
test('an older unfinished trial cannot silently reuse an insufficient trial schedule', async () => {
  const f = setup({ existing: { _id: 'user', phase: 'ready', mode: 'live', paymentType: 'trial', subscriptionId: 'sub_old', trialEnd: new Date((Math.floor(Date.now() / 1000) + 86400) * 1000) } });
  const response = await f.initiate();
  assert.equal(response.code, 409);
  assert.match(response.data.error, /older checkout/);
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 0);
});
test('immediate monthly checkout on the offer page requires separate price consent', async () => {
  const f = setup(); const response = await f.initiate({ paymentType: 'monthly' });
  assert.equal(response.code, 400);
  assert.equal(f.calls.length, 0);
  assert.equal((await f.initiate({ paymentType: 'monthly', monthlyConsent: true })).code, 201);
});

for (const mobileNumber of ['9000090000', '919000090000', '+91 90000 90000']) {
  test(`checkout reuses normalized phone ${mobileNumber} without inventing email`, async () => {
    const response = await setup().initiate({}, { mobileNumber, email: '  ' });
    assert.equal(response.code, 201);
    assert.equal(response.data.prefill.contact, '+919000090000');
    assert.equal(Object.hasOwn(response.data.prefill, 'email'), false);
  });
}
