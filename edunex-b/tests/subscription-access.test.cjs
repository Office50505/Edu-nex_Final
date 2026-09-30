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
