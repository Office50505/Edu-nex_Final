const test = require('node:test');
const assert = require('node:assert/strict');
const { subscriptionPresentation } = require('../services/subscriptionPresentation');

const now = Date.parse('2026-11-02T10:00:00Z');
const future = '2026-12-02T10:00:00.000Z';
const past = '2026-10-02T10:00:00.000Z';
const verified = { entitlementState: 'ACTIVE', entitlementActive: true, subscriptionExpiry: future };

test('observed expired record cannot display ACTIVE or imply lifetime access', () => {
  const plan = subscriptionPresentation({ subscriptionStatus: 'expired', entitlementActive: true }, now);
  assert.equal(plan.planLabel, 'Expired');
  assert.equal(plan.badgeLabel, 'INACTIVE');
  assert.equal(plan.expiresAt, null);
  assert.equal(plan.missingExpiryLabel, '—');
});

test('verified access takes precedence over a stale billing status', () => {
  const plan = subscriptionPresentation({ ...verified, subscriptionStatus: 'expired' }, now);
  assert.equal(plan.planLabel, 'Premium');
  assert.equal(plan.badgeLabel, 'ACTIVE');
  assert.equal(plan.expiresAt, future);
  assert.equal(plan.daysRemaining, 30);
});

test('past-due and invalid expiry never show active access', () => {
  for (const subscriptionExpiry of [past, 'invalid', null]) {
    const plan = subscriptionPresentation({ ...verified, subscriptionExpiry }, now);
    assert.equal(plan.active, false);
    assert.equal(plan.badgeLabel, 'INACTIVE');
    assert.equal(plan.daysRemaining, 0);
  }
});

test('explicit server denial overrides a legacy paid status', () => {
  const plan = subscriptionPresentation({ subscriptionStatus: 'active', entitlementActive: false, subscriptionExpiry: future }, now);
  assert.equal(plan.active, false);
});

test('free accounts do not expose stale expiry dates', () => {
  for (const data of [{ subscriptionStatus: 'none' }, { entitlementState: 'NONE', subscriptionStatus: 'expired', subscriptionExpiry: past }]) {
    const plan = subscriptionPresentation(data, now);
    assert.equal(plan.planLabel, 'Free');
    assert.equal(plan.badgeLabel, 'INACTIVE');
    assert.equal(plan.expiresAt, null);
  }
});

test('verified trial and cancel-at-period-end remain active through expiry', () => {
  assert.equal(subscriptionPresentation({ ...verified, subscriptionStatus: 'trial' }, now).planLabel, 'Trial');
  const plan = subscriptionPresentation({ ...verified, entitlementState: 'ACTIVE_CANCELS_AT_PERIOD_END' }, now);
  assert.equal(plan.active, true);
  assert.equal(plan.expiresAt, future);
});

test('revoked, refunded and expired states cannot inherit an ACTIVE badge', () => {
  for (const [state, label] of [['REVOKED', 'Revoked'], ['REFUNDED', 'Refunded'], ['EXPIRED', 'Expired']]) {
    const plan = subscriptionPresentation({ ...verified, entitlementState: state }, now);
    assert.equal(plan.planLabel, label);
    assert.equal(plan.badgeLabel, 'INACTIVE');
  }
});

test('unknown verification state never grants display access', () => {
  assert.equal(subscriptionPresentation({ ...verified, entitlementState: 'UNKNOWN' }, now).active, false);
});

test('undated legacy access does not claim to be lifetime access', () => {
  const plan = subscriptionPresentation({ subscriptionStatus: 'active' }, now);
  assert.equal(plan.active, true);
  assert.equal(plan.missingExpiryLabel, 'Not provided');
});

test('grace access displays its grace expiry rather than the expired billing period', () => {
  const plan = subscriptionPresentation({ ...verified, entitlementState: 'GRACE_PERIOD', subscriptionExpiry: past, gracePeriodExpiresAt: future }, now);
  assert.equal(plan.active, true);
  assert.equal(plan.expiresAt, future);
});
