const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadAccountEntitlement, publicAccountEntitlement } = require('../services/accountEntitlement');

const now = Date.parse('2026-10-09T12:00:00Z');
const future = new Date(now + 86400000);
const expired = new Date(now - 1000);

function dependencies({ razorpay = null, apple = null, google = null } = {}) {
  const model = value => ({ findOne: async query => {
    assert.equal(String(query.user), 'same-skillomate-account');
    return value;
  } });
  return {
    now,
    Subscription: model(razorpay),
    AppleSubscription: model(apple),
    GooglePlaySubscription: model(google),
  };
}

async function entitlement(records, user = {}) {
  const result = await loadAccountEntitlement({
    _id: 'same-skillomate-account',
    subscriptionStatus: 'expired',
    ...user,
  }, dependencies(records));
  return publicAccountEntitlement(result, new Date(now));
}

test('one verified Skillomate account recognizes Razorpay, Apple, and Google Play access on every client', async () => {
  const cases = [
    [{ razorpay: { gateway: 'razorpay', status: 'active', currentPeriodEnd: future } }, 'razorpay'],
    [{ apple: { entitlementState: 'ACTIVE', expiresAt: future } }, 'apple'],
    [{ google: { entitlementState: 'ACTIVE', expiresAt: future } }, 'google_play'],
  ];
  for (const [records, source] of cases) {
    const result = await entitlement(records);
    assert.equal(result.entitlementActive, true);
    assert.equal(result.subscriptionStatus, 'active');
    assert.equal(result.entitlementSource, source);
    assert.equal(+new Date(result.subscriptionExpiry), +future);
  }
});

test('an expired provider cannot override another provider with a verified paid period', async () => {
  for (const records of [
    { razorpay: { status: 'expired', currentPeriodEnd: expired }, google: { entitlementState: 'ACTIVE', expiresAt: future } },
    { google: { entitlementState: 'EXPIRED', expiresAt: expired }, razorpay: { status: 'active', currentPeriodEnd: future } },
    { apple: { entitlementState: 'EXPIRED', expiresAt: expired }, google: { entitlementState: 'ACTIVE_CANCELS_AT_PERIOD_END', expiresAt: future } },
  ]) assert.equal((await entitlement(records)).entitlementActive, true);
});

test('cancelled access remains active until verified expiry while hold, pending, refund, and revocation remain inactive', async () => {
  assert.equal((await entitlement({ razorpay: { status: 'cancelled', currentPeriodEnd: future } })).entitlementActive, true);
  assert.equal((await entitlement({ google: { entitlementState: 'ACTIVE_CANCELS_AT_PERIOD_END', expiresAt: future } })).entitlementActive, true);
  for (const state of ['PENDING', 'BILLING_RETRY', 'REFUNDED', 'REVOKED', 'EXPIRED']) {
    assert.equal((await entitlement({ google: { entitlementState: state, expiresAt: future } })).entitlementActive, false);
  }
});

test('multiple active providers grant one account entitlement without creating or changing subscriptions', async () => {
  const result = await entitlement({
    razorpay: { gateway: 'razorpay', status: 'active', currentPeriodEnd: future },
    apple: { entitlementState: 'ACTIVE', expiresAt: future },
    google: { entitlementState: 'ACTIVE', expiresAt: future },
  });
  assert.equal(result.entitlementActive, true);
  assert.ok(['apple', 'google_play', 'legacy'].includes(result.entitlementSource));
});

test('mobile login, restoration, foreground, and store callbacks refresh the backend all-provider entitlement', () => {
  const app = fs.readFileSync(path.join(__dirname, '../../appcopyai/App.js'), 'utf8');
  const route = fs.readFileSync(path.join(__dirname, '../routes/mobileCompat.js'), 'utf8');
  assert.match(app, /refreshAccountEntitlement[\s\S]*\/api\/user\/\$\{encodeURIComponent\(owner\._id\)\}\/subscription/);
  assert.match(app, /onEntitlementChanged: onStoreEntitlementChanged/g);
  assert.match(app, /nativeSession\.restore\(\)[\s\S]*refreshUser/);
  assert.match(app, /async function validateSession\(\)[\s\S]*refreshUser\(id, null, sid\)[\s\S]*AppState\.addEventListener\("change"/);
  assert.match(route, /auth\/validate\/:id[\s\S]*loadAccountEntitlement\(req\.compatUser\)/);
  assert.match(route, /user\/:id\/subscription[\s\S]*publicAccountEntitlement/);
});
