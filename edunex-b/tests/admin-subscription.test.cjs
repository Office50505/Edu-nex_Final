const test = require('node:test');
const assert = require('node:assert/strict');
const { subscriptionChange } = require('../services/adminSubscription');
const { resolveSubscriptionAccess } = require('../services/subscriptionAccess');
const { hasTrialHistoryMarker } = require('../services/trialEligibility');
const now = new Date('2026-09-25T00:00:00Z');

for (const before of ['none', 'trial', 'subscribed']) {
  for (const after of ['none', 'trial', 'subscribed']) {
    test(`${before} -> ${after} changes effective access and clears stale entitlement dates`, () => {
      const prior = subscriptionChange({ status: before, reason: 'Setup' }, {}, null, now);
      const change = subscriptionChange({ status: after, reason: 'Admin correction' }, prior.subscription, null, now);
      const access = resolveSubscriptionAccess(change.subscription, change.user, +now);
      assert.equal(access.active, after !== 'none');
      assert.equal(access.status, after === 'subscribed' ? 'active' : after);
      assert.equal(change.user.subscriptionStatus, after);
      assert.equal(change.user.isOnTrial, after === 'trial');
      assert.equal(change.subscription.nextBillingAt, null);
      if (after !== 'none') {
        const days = after === 'trial' ? 1 : 30;
        assert.equal(+access.expiresAt, +now + days * 86400000);
        assert.equal(resolveSubscriptionAccess(change.subscription, change.user, +access.expiresAt).active, false);
      }
      if (before === 'trial') assert.equal(hasTrialHistoryMarker(change.subscription, change.user), true);
      assert.equal('purchasedCourses' in change.user, false);
    });
  }
}

test('rejects invalid statuses, durations and missing audit reasons', () => {
  for (const status of ['active', 'expired', 'unknown', '']) assert.throws(() => subscriptionChange({ status, reason: 'Test' }), /Choose/);
  for (const durationDays of [0, -1, 1.5, 3651, 'bad', '']) assert.throws(() => subscriptionChange({ status: 'trial', durationDays, reason: 'Test' }), /whole number/);
  assert.throws(() => subscriptionChange({ status: 'none', reason: ' ' }), /reason/);
});

test('blocks pending billing and ongoing mandates without making provider requests', () => {
  for (const phase of ['creating', 'ready', 'uncertain']) assert.throws(() => subscriptionChange({ status: 'none', reason: 'Test' }, {}, { phase }), error => error.statusCode === 409);
  assert.throws(() => subscriptionChange({ status: 'trial', reason: 'Test' }, { razorpaySubscriptionId: 'sub_live', razorpayStatus: 'active' }), /AutoPay/);
  assert.throws(() => subscriptionChange({ status: 'trial', reason: 'Test' }, { phonePeMandateId: 'mandate' }), /AutoPay/);
  const change = subscriptionChange({ status: 'none', reason: 'Test' }, { razorpaySubscriptionId: 'sub_old', razorpayStatus: 'cancelled' }, { phase: 'closed', subscriptionId: 'sub_old' });
  assert.equal(change.subscription.adminBillingSubscriptionId, 'sub_old');
});

test('legacy grant/revoke clients map to supported statuses', () => {
  assert.equal(subscriptionChange({ action: 'grant', reason: 'Test' }).status, 'subscribed');
  assert.equal(subscriptionChange({ action: 'revoke', reason: 'Test' }).status, 'none');
});
