const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveAllSubscriptionAccess, resolveSubscriptionAccess } = require('../services/subscriptionAccess');

const now = Date.parse('2026-09-18T08:55:00.000Z');

test('cancelled or expired records preserve an already-paid trial window', () => {
  for (const status of ['cancelled', 'expired']) {
    const access = resolveSubscriptionAccess({ status, trialStartedAt: new Date(now - 60000), trialExpiresAt: new Date(now + 86400000) }, {}, now);
    assert.equal(access.active, true);
    assert.equal(access.status, 'trial');
  }
});

test('cancelled subscriptions preserve a paid billing period', () => {
  const access = resolveSubscriptionAccess({ status: 'cancelled', currentPeriodEnd: new Date(now + 86400000) }, {}, now);
  assert.equal(access.active, true);
  assert.equal(access.status, 'active');
});

test('expired paid windows do not grant access', () => {
  const access = resolveSubscriptionAccess({ status: 'expired', trialExpiresAt: new Date(now - 1), currentPeriodEnd: new Date(now - 1) }, {}, now);
  assert.equal(access.active, false);
  assert.equal(access.status, 'none');
});

test('active Google Play periods grant access and revoked store state cannot use stale user status', () => {
  const future = new Date(now + 86400000);
  const active = resolveAllSubscriptionAccess(null, null, {
    entitlementState: 'ACTIVE',
    expiresAt: future,
  }, { subscriptionStatus: 'active', subscriptionExpiry: future }, now);
  assert.equal(active.active, true);
  assert.equal(active.source, 'google_play');

  const revoked = resolveAllSubscriptionAccess(null, null, {
    entitlementState: 'REVOKED',
    expiresAt: future,
  }, { subscriptionStatus: 'active', subscriptionExpiry: future }, now);
  assert.equal(revoked.active, false);
  assert.equal(revoked.source, 'none');
});

test('an independent legacy billing period remains valid alongside an inactive store record', () => {
  const access = resolveAllSubscriptionAccess({
    status: 'cancelled',
    currentPeriodEnd: new Date(now + 86400000),
  }, null, {
    entitlementState: 'EXPIRED',
    expiresAt: new Date(now - 1),
  }, { subscriptionStatus: 'expired' }, now);
  assert.equal(access.active, true);
  assert.equal(access.source, 'legacy');
});

test('Google course access honors grace, cancellation, payment failures and expiry independently of stale user status', () => {
  const future = new Date(now + 86400000);
  for (const [entitlementState, expiresAt, active] of [
    ['GRACE_PERIOD', future, true],
    ['ACTIVE_CANCELS_AT_PERIOD_END', future, true],
    ['BILLING_RETRY', future, false],
    ['EXPIRED', future, false],
    ['ACTIVE', new Date(now), false],
  ]) {
    const access = resolveAllSubscriptionAccess(null, null, { entitlementState, expiresAt },
      { subscriptionStatus: 'active', subscriptionExpiry: future }, now);
    assert.equal(access.active, active);
  }
});

test('Google course access rejects cached product/package mismatches just like the status API', () => {
  const future = new Date(now + 86400000);
  for (const mismatch of [{ productId: 'another_product' }, { packageName: 'another.package' }]) {
    const access = resolveAllSubscriptionAccess(null, null,
      { entitlementState: 'ACTIVE', expiresAt: future, ...mismatch },
      { subscriptionStatus: 'active', subscriptionExpiry: future }, now);
    assert.equal(access.active, false);
  }
});

test('an expired legacy record cannot revive its own stale User mirror', () => {
  const access = resolveAllSubscriptionAccess({ status: 'expired', currentPeriodEnd: new Date(now - 1) }, null, null,
    { subscriptionStatus: 'active', subscriptionExpiry: new Date(now + 86400000) }, now);
  assert.equal(access.active, false);
});

test('independent Apple and Google periods survive expiry of another provider', () => {
  const future = new Date(now + 86400000);
  const expired = { status: 'expired', currentPeriodEnd: new Date(now - 1) };
  const apple = resolveAllSubscriptionAccess(expired, { entitlementState: 'ACTIVE', expiresAt: future },
    { entitlementState: 'EXPIRED', expiresAt: new Date(now - 1) }, { subscriptionStatus: 'expired' }, now);
  assert.equal(apple.source, 'apple');
  assert.equal(apple.active, true);
  const google = resolveAllSubscriptionAccess(expired, { entitlementState: 'REFUNDED', expiresAt: future },
    { entitlementState: 'ACTIVE', expiresAt: future }, { subscriptionStatus: 'expired' }, now);
  assert.equal(google.source, 'google_play');
  assert.equal(google.active, true);
});

test('combined access preserves Razorpay grace without borrowing it for Google', () => {
  const end = new Date(now - 1000);
  const legacy = { gateway: 'razorpay', status: 'trial', trialExpiresAt: end,
    razorpaySubscriptionId: 'sub_legacy', razorpayStatus: 'authenticated' };
  const access = resolveAllSubscriptionAccess(legacy, null, { entitlementState: 'BILLING_RETRY', expiresAt: new Date(now + 86400000) }, {}, now);
  assert.equal(access.active, true);
  assert.equal(access.entitlementState, 'GRACE_PERIOD');
  assert.equal(access.grace, true);
  assert.equal(resolveAllSubscriptionAccess(null, null, { entitlementState: 'BILLING_RETRY', expiresAt: new Date(now + 86400000) }, {}, now).active, false);
});
