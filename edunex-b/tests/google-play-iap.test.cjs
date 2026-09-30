const test = require('node:test');
const assert = require('node:assert/strict');

const {
  GOOGLE_PLAY_INTRODUCTORY_OFFER_ID,
  GOOGLE_PLAY_PACKAGE_NAME,
  GOOGLE_PLAY_PRODUCT_ID,
  STATES,
  deriveGooglePlayEntitlement,
} = require('../services/googlePlayEntitlement');
const {
  GooglePlayIapError,
  createGooglePlayIapService,
  obfuscatedAccountIdForUser,
  purchaseTokenHash,
} = require('../services/googlePlayIapService');
const {
  decodeGooglePlayRtdnMessage,
  verifyGooglePlayPubSubAuthorization,
} = require('../services/googlePlayRtdn');

const now = Date.parse('2026-09-30T08:00:00Z');
const future = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
const past = new Date(now - 1000).toISOString();

function snapshotFor(userId, overrides = {}) {
  return {
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
    latestOrderId: 'GPA.1234-5678-9012-34567',
    externalAccountIdentifiers: {
      obfuscatedExternalAccountId: obfuscatedAccountIdForUser(userId),
    },
    lineItems: [{
      productId: GOOGLE_PLAY_PRODUCT_ID,
      expiryTime: future,
      autoRenewingPlan: { autoRenewEnabled: true },
      offerDetails: { basePlanId: 'monthly', offerId: GOOGLE_PLAY_INTRODUCTORY_OFFER_ID },
    }],
    ...overrides,
  };
}

function modelHarness({ documents = [], loadSnapshot } = {}) {
  let stored = documents.map(value => ({ ...value }));
  const userUpdates = [];
  const GooglePlaySubscription = {
    findOne: async query => {
      if (query.user !== undefined) return stored.find(item => String(item.user) === String(query.user)) || null;
      if (query.purchaseTokenHash) return stored.find(item => item.purchaseTokenHash === query.purchaseTokenHash) || null;
      return null;
    },
    findOneAndUpdate: async (query, update) => {
      const index = stored.findIndex(item => String(item.user) === String(query.user));
      const next = {
        ...(index >= 0 ? stored[index] : { user: query.user, ...update.$setOnInsert }),
        ...update.$set,
      };
      if (index >= 0) stored[index] = next;
      else stored.push(next);
      return next;
    },
  };
  const User = {
    updateOne: async (query, update) => {
      userUpdates.push({ query, update });
      return { modifiedCount: 1 };
    },
  };
  const service = createGooglePlayIapService({
    GooglePlaySubscription,
    User,
    loadSnapshot,
    now: () => now,
  });
  return { service, userUpdates, get documents() { return stored; } };
}

test('Google Play entitlement grants only live paid periods', () => {
  assert.equal(deriveGooglePlayEntitlement(snapshotFor('user-a'), now).entitlementState, STATES.ACTIVE);
  assert.equal(deriveGooglePlayEntitlement(snapshotFor('user-a', {
    lineItems: [{
      productId: GOOGLE_PLAY_PRODUCT_ID,
      expiryTime: future,
      autoRenewingPlan: { autoRenewEnabled: false },
    }],
  }), now).entitlementState, STATES.ACTIVE_CANCELS_AT_PERIOD_END);
  assert.equal(deriveGooglePlayEntitlement(snapshotFor('user-a', {
    subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
  }), now).entitlementActive, true);
  for (const [subscriptionState, expected] of [
    ['SUBSCRIPTION_STATE_ON_HOLD', STATES.BILLING_RETRY],
    ['SUBSCRIPTION_STATE_PAUSED', STATES.BILLING_RETRY],
    ['SUBSCRIPTION_STATE_PENDING', STATES.BILLING_RETRY],
    ['SUBSCRIPTION_STATE_EXPIRED', STATES.EXPIRED],
    ['SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED', STATES.REVOKED],
  ]) {
    const value = deriveGooglePlayEntitlement(snapshotFor('user-a', { subscriptionState }), now);
    assert.equal(value.entitlementState, expected);
    assert.equal(value.entitlementActive, false);
  }
  const expired = deriveGooglePlayEntitlement(snapshotFor('user-a', {
    lineItems: [{ productId: GOOGLE_PLAY_PRODUCT_ID, expiryTime: past }],
  }), now);
  assert.equal(expired.entitlementActive, false);
});

test('server verifies the Play token, account binding, product, and current state before access', async () => {
  const token = 'play-token-'.padEnd(64, 'x');
  const harness = modelHarness({ loadSnapshot: async value => {
    assert.equal(value, token);
    return snapshotFor('user-a');
  } });
  const result = await harness.service.verifyClientPurchase('user-a', token);
  assert.equal(result.entitlementActive, true);
  assert.equal(result.entitlementState, STATES.ACTIVE);
  assert.equal(harness.documents[0].purchaseTokenHash, purchaseTokenHash(token));
  assert.equal(harness.documents[0].offerId, GOOGLE_PLAY_INTRODUCTORY_OFFER_ID);
  assert.equal(harness.userUpdates[0].update.$set.subscriptionStatus, 'active');

  const wrongAccount = modelHarness({ loadSnapshot: async () => snapshotFor('user-b') });
  await assert.rejects(
    wrongAccount.service.verifyClientPurchase('user-a', token),
    error => error instanceof GooglePlayIapError && error.code === 'GOOGLE_PLAY_ACCOUNT_MISMATCH'
  );

  const wrongProduct = modelHarness({ loadSnapshot: async () => snapshotFor('user-a', {
    lineItems: [{ productId: 'different_product', expiryTime: future }],
  }) });
  await assert.rejects(
    wrongProduct.service.verifyClientPurchase('user-a', token),
    error => error instanceof GooglePlayIapError && error.code === 'GOOGLE_PLAY_PRODUCT_MISMATCH'
  );
});

test('a Play purchase token cannot be linked to two Skillomate accounts', async () => {
  const token = 'owned-play-token-'.padEnd(64, 'y');
  const harness = modelHarness({
    documents: [{
      user: 'user-b',
      purchaseToken: token,
      purchaseTokenHash: purchaseTokenHash(token),
      entitlementState: STATES.ACTIVE,
      expiresAt: new Date(future),
    }],
    loadSnapshot: async () => snapshotFor('user-a'),
  });
  await assert.rejects(
    harness.service.verifyClientPurchase('user-a', token),
    error => error instanceof GooglePlayIapError && error.code === 'GOOGLE_PLAY_PURCHASE_OWNERSHIP'
  );
});

test('an unavailable Google API cannot activate a new client-submitted token', async () => {
  const harness = modelHarness({ loadSnapshot: async () => {
    throw new GooglePlayIapError('unavailable', 503, 'GOOGLE_PLAY_API_UNAVAILABLE');
  } });
  await assert.rejects(
    harness.service.verifyClientPurchase('user-a', 'unverified-token-'.padEnd(64, 'z')),
    /unavailable/
  );
  assert.equal(harness.documents.length, 0);
  assert.equal(harness.userUpdates.length, 0);
});

test('authenticated Google Play notifications refresh the one-day offer into the next billing phase', async () => {
  const token = 'notification-play-token-'.padEnd(64, 'n');
  const harness = modelHarness({
    documents: [{
      user: 'user-a',
      purchaseToken: token,
      purchaseTokenHash: purchaseTokenHash(token),
      entitlementState: STATES.ACTIVE,
      expiresAt: new Date(now + 24 * 60 * 60 * 1000),
    }],
    loadSnapshot: async value => {
      assert.equal(value, token);
      return snapshotFor('user-a');
    },
  });
  const result = await harness.service.processDeveloperNotification(token);
  assert.equal(result.processed, true);
  assert.equal(result.entitlement.entitlementActive, true);
  assert.equal(harness.documents[0].expiresAt.toISOString(), future);
  assert.equal(harness.userUpdates.length, 1);
});

test('Google Play RTDN requires the configured Pub/Sub sender and exact Android package', async () => {
  const token = 'rtdn-play-token-'.padEnd(64, 'r');
  const body = {
    message: {
      data: Buffer.from(JSON.stringify({
        packageName: GOOGLE_PLAY_PACKAGE_NAME,
        subscriptionNotification: { purchaseToken: token },
      })).toString('base64'),
    },
  };
  assert.deepEqual(decodeGooglePlayRtdnMessage(body), { test: false, purchaseToken: token });
  assert.throws(() => decodeGooglePlayRtdnMessage({
    message: { data: Buffer.from(JSON.stringify({ packageName: 'wrong.package' })).toString('base64') },
  }), error => error.code === 'GOOGLE_PLAY_RTDN_PACKAGE_MISMATCH');

  const payload = await verifyGooglePlayPubSubAuthorization('Bearer signed-token', {
    audience: 'https://api.skillomate.in/api/google-play-iap/notifications',
    serviceAccountEmail: 'pubsub@example.iam.gserviceaccount.com',
    client: {
      verifyIdToken: async ({ idToken, audience }) => {
        assert.equal(idToken, 'signed-token');
        assert.equal(audience, 'https://api.skillomate.in/api/google-play-iap/notifications');
        return { getPayload: () => ({ email: 'pubsub@example.iam.gserviceaccount.com', email_verified: true }) };
      },
    },
  });
  assert.equal(payload.email_verified, true);
  await assert.rejects(
    verifyGooglePlayPubSubAuthorization('Bearer signed-token', {
      audience: 'expected-audience',
      serviceAccountEmail: 'allowed@example.iam.gserviceaccount.com',
      client: { verifyIdToken: async () => ({ getPayload: () => ({ email: 'other@example.com', email_verified: true }) }) },
    }),
    error => error.code === 'GOOGLE_PLAY_RTDN_SENDER_MISMATCH',
  );
});
