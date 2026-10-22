const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

const {
  GOOGLE_PLAY_INTRODUCTORY_OFFER_ID,
  GOOGLE_PLAY_PACKAGE_NAME,
  GOOGLE_PLAY_PRODUCT_ID,
  STATES,
  deriveGooglePlayEntitlement,
  publicGooglePlayEntitlement,
} = require('../services/googlePlayEntitlement');
const {
  GooglePlayIapError,
  createGooglePlayIapService,
  acknowledgeSubscription,
  fetchSubscriptionSnapshot,
  obfuscatedAccountIdForUser,
  purchaseTokenHash,
} = require('../services/googlePlayIapService');
const {
  decodeGooglePlayRtdnMessage,
  verifyGooglePlayPubSubAuthorization,
} = require('../services/googlePlayRtdn');
const { normalizeEntitlement } = require('../../appcopyai/services/subscriptions');

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

function matches(document, query) {
  return Object.entries(query).every(([key, expected]) => {
    if (key === '$or') return expected.some(value => matches(document, value));
    if (key === '$and') return expected.every(value => matches(document, value));
    const actual = document[key];
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
      return Object.entries(expected).every(([operator, value]) => {
        if (operator === '$exists') return (actual !== undefined) === value;
        if (operator === '$lte') return actual != null && new Date(actual).getTime() <= new Date(value).getTime();
        if (operator === '$gte') return actual != null && new Date(actual).getTime() >= new Date(value).getTime();
        if (operator === '$in') return value.includes(actual);
        throw new Error(`Unsupported test operator ${operator}`);
      });
    }
    return expected === null ? actual == null : String(actual) === String(expected);
  });
}

function collection(initial, uniqueField) {
  const stored = initial.map(value => ({ ...value }));
  function apply(document, update, inserted) {
    if (inserted) Object.assign(document, update.$setOnInsert || {});
    Object.assign(document, update.$set || {});
    for (const [key, value] of Object.entries(update.$inc || {})) document[key] = (document[key] || 0) + value;
  }
  return {
    stored,
    findOne: async query => { const item = stored.find(value => matches(value, query)); return item ? { ...item } : null; },
    findOneAndUpdate: async (query, update, options = {}) => {
      let item = stored.find(value => matches(value, query));
      if (!item && options.upsert) {
        if (stored.some(value => String(value[uniqueField]) === String(query[uniqueField]))) throw { code: 11000 };
        item = { [uniqueField]: query[uniqueField] };
        stored.push(item);
        apply(item, update, true);
      } else if (item) apply(item, update, false);
      return item ? { ...item } : null;
    },
    updateOne: async (query, update) => {
      const item = stored.find(value => matches(value, query));
      if (item) apply(item, update, false);
      return { matchedCount: item ? 1 : 0, modifiedCount: item ? 1 : 0 };
    },
    find: query => {
      let items = stored.filter(value => matches(value, query));
      const chain = {
        sort: sorting => { const key = Object.keys(sorting)[0]; items.sort((a, b) => new Date(a[key] || 0) - new Date(b[key] || 0)); return chain; },
        limit: limit => { items = items.slice(0, limit); return chain; },
        select: async () => items.map(item => ({ ...item })),
      };
      return chain;
    },
  };
}

function modelHarness({ documents = [], work = [], loadSnapshot, acknowledge, currentTime = () => now } = {}) {
  const GooglePlaySubscription = collection(documents, 'user');
  const GooglePlayReconciliation = collection(work, '_id');
  const userUpdates = [];
  const acknowledgements = [];
  const warnings = [];
  const User = { findById: async id => ({ _id: id, isActive: true }),
    updateOne: async (query, update) => { userUpdates.push({ query, update }); return { modifiedCount: 1 }; } };
  const service = createGooglePlayIapService({
    GooglePlaySubscription, GooglePlayReconciliation, User, loadSnapshot,
    acknowledgeSubscription: async (...args) => { acknowledgements.push(args); if (acknowledge) return acknowledge(...args); },
    syncUserSubscriptionMirror: async userId => {
      const current = GooglePlaySubscription.stored.find(item => item.user === userId);
      const value = publicGooglePlayEntitlement(current, new Date(currentTime()));
      await User.updateOne({ _id: userId }, { $set: { subscriptionStatus: value.entitlementActive ? 'active' : 'expired', subscriptionExpiry: value.expiresAt, isOnTrial: false } });
    },
    logger: { warn: message => warnings.push(message), error: message => warnings.push(message) },
    now: currentTime,
  });
  return { service, userUpdates, acknowledgements, warnings, models: { GooglePlaySubscription, GooglePlayReconciliation, User },
    get documents() { return GooglePlaySubscription.stored; }, get work() { return GooglePlayReconciliation.stored; } };
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
  assert.equal(expired.entitlementState, STATES.EXPIRED);
});

test('Google Play configuration defaults and explicit environment overrides are consistent', () => {
  const readConfiguration = overrides => JSON.parse(execFileSync(process.execPath, ['-e',
    `const configuration = require('./services/googlePlayEntitlement');
    console.log(JSON.stringify({ product: configuration.GOOGLE_PLAY_PRODUCT_ID,
      package: configuration.GOOGLE_PLAY_PACKAGE_NAME, offer: configuration.GOOGLE_PLAY_INTRODUCTORY_OFFER_ID }));`,
  ], {
    cwd: require('node:path').resolve(__dirname, '..'),
    env: {
      ...process.env,
      GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID: '',
      GOOGLE_PLAY_PACKAGE_NAME: '',
      GOOGLE_PLAY_INTRODUCTORY_OFFER_ID: '',
      ...overrides,
    },
    encoding: 'utf8',
  }));
  assert.deepEqual(readConfiguration({}), {
    product: 'skillomate_premium_monthly', package: 'com.skillomate.app', offer: 'intro-9rs-3days',
  });
  assert.deepEqual(readConfiguration({
    GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID: ' test_subscription ',
    GOOGLE_PLAY_PACKAGE_NAME: ' com.example.test ',
    GOOGLE_PLAY_INTRODUCTORY_OFFER_ID: ' test-offer ',
  }), { product: 'test_subscription', package: 'com.example.test', offer: 'test-offer' });
  assert.equal(readConfiguration({ GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID: '   ' }).product, 'skillomate_premium_monthly');
});

test('Google grace-period expiry preserves access through the mobile entitlement contract', () => {
  const entitlement = deriveGooglePlayEntitlement(snapshotFor('user-a', {
    subscriptionState: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
  }), now);
  const response = publicGooglePlayEntitlement(entitlement, new Date(now));
  assert.equal(response.entitlementState, STATES.GRACE_PERIOD);
  assert.equal(response.gracePeriodExpiresAt.toISOString(), future);
  assert.equal(normalizeEntitlement(response, now).active, true);
  const expired = publicGooglePlayEntitlement(entitlement, new Date(Date.parse(future)));
  assert.equal(expired.entitlementState, STATES.EXPIRED);
  assert.equal(expired.gracePeriodExpiresAt, null);
  assert.equal(normalizeEntitlement(expired, Date.parse(future)).active, false);
});

test('cached expired, malformed, and differently configured purchases never grant access', () => {
  for (const state of [STATES.ACTIVE, STATES.ACTIVE_CANCELS_AT_PERIOD_END, STATES.GRACE_PERIOD]) {
    const expired = publicGooglePlayEntitlement({ entitlementState: state, expiresAt: past }, new Date(now));
    assert.equal(expired.entitlementState, STATES.EXPIRED);
    assert.equal(expired.entitlementActive, false);
  }
  for (const overrides of [
    { expiresAt: 'invalid date' },
    { expiresAt: null },
    { productId: 'previous_product' },
    { packageName: 'another.package' },
  ]) {
    const response = publicGooglePlayEntitlement({ entitlementState: STATES.ACTIVE, expiresAt: future, ...overrides }, new Date(now));
    assert.equal(response.entitlementState, STATES.UNKNOWN);
    assert.equal(response.entitlementActive, false);
  }
  const malformed = deriveGooglePlayEntitlement(snapshotFor('user-a', {
    lineItems: [{ productId: GOOGLE_PLAY_PRODUCT_ID, expiryTime: 'invalid date' }],
  }), now);
  assert.equal(malformed.entitlementActive, false);
  assert.equal(malformed.expiresAt, null);
});

test('purchase verification queries Google with the configured package and safely encoded token', async () => {
  const token = 'play-token/with+special?characters';
  const snapshot = snapshotFor('user-a');
  const result = await fetchSubscriptionSnapshot(token, async () => ({
    request: async request => {
      assert.equal(request.method, 'GET');
      assert.equal(request.timeout, 15_000);
      assert.equal(request.retry, false);
      assert.equal(request.url, `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(GOOGLE_PLAY_PACKAGE_NAME)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`);
      return { data: snapshot };
    },
  }));
  assert.equal(result, snapshot);
  await assert.rejects(fetchSubscriptionSnapshot(token, async () => null), error => error.code === 'GOOGLE_PLAY_API_NOT_CONFIGURED');
  for (const status of [404, 410, 500]) {
    await assert.rejects(fetchSubscriptionSnapshot(token, async () => ({
      request: async () => { throw { response: { status } }; },
    })), error => error.code === (status === 500 ? 'GOOGLE_PLAY_API_UNAVAILABLE' : 'GOOGLE_PLAY_PURCHASE_NOT_FOUND'));
  }
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

test('linked purchases retain account ownership and invalid tokens never contact Google', async () => {
  const oldToken = 'old-play-token-'.padEnd(64, 'x');
  const newToken = 'new-play-token-'.padEnd(64, 'y');
  const harness = modelHarness({
    documents: [{ user: 'user-b', purchaseTokenHash: purchaseTokenHash(oldToken) }],
    loadSnapshot: async () => snapshotFor('user-a', { linkedPurchaseToken: oldToken }),
  });
  await assert.rejects(harness.service.verifyClientPurchase('user-a', newToken), error => error.code === 'GOOGLE_PLAY_LINKED_PURCHASE_OWNERSHIP');
  assert.equal(harness.userUpdates.length, 0);

  const invalid = modelHarness({ loadSnapshot: async () => assert.fail('Invalid tokens must not contact Google') });
  for (const token of [null, {}, '', 'short', 'x'.repeat(4097)]) {
    await assert.rejects(invalid.service.verifyClientPurchase('user-a', token), error => error.code === 'GOOGLE_PLAY_TOKEN_REQUIRED');
    await assert.rejects(invalid.service.processDeveloperNotification(token), error => error.code === 'GOOGLE_PLAY_NOTIFICATION_TOKEN_INVALID');
  }
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

test('authenticated Google Play notifications refresh the three-day offer into the next billing phase', async () => {
  const token = 'notification-play-token-'.padEnd(64, 'n');
  const harness = modelHarness({
    documents: [{
      user: 'user-a',
      purchaseToken: token,
      purchaseTokenHash: purchaseTokenHash(token),
      entitlementState: STATES.ACTIVE,
      expiresAt: new Date(now + 3 * 24 * 60 * 60 * 1000),
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

test('RTDN refresh handles cancellation, grace, payment failure, recovery, and expiry using current Google state', async () => {
  const token = 'lifecycle-play-token-'.padEnd(64, 'l');
  let snapshot = snapshotFor('user-a');
  const harness = modelHarness({
    documents: [{ user: 'user-a', purchaseToken: token, purchaseTokenHash: purchaseTokenHash(token) }],
    loadSnapshot: async () => snapshot,
  });
  for (const [subscriptionState, expectedState, active, expiry] of [
    ['SUBSCRIPTION_STATE_CANCELED', STATES.ACTIVE_CANCELS_AT_PERIOD_END, true, future],
    ['SUBSCRIPTION_STATE_IN_GRACE_PERIOD', STATES.GRACE_PERIOD, true, future],
    ['SUBSCRIPTION_STATE_ON_HOLD', STATES.BILLING_RETRY, false, past],
    ['SUBSCRIPTION_STATE_ACTIVE', STATES.ACTIVE, true, future],
    ['SUBSCRIPTION_STATE_PAUSED', STATES.BILLING_RETRY, false, future],
    ['SUBSCRIPTION_STATE_PENDING', STATES.BILLING_RETRY, false, future],
    ['SUBSCRIPTION_STATE_EXPIRED', STATES.EXPIRED, false, past],
    ['SUBSCRIPTION_STATE_CANCELED', STATES.EXPIRED, false, past],
  ]) {
    snapshot = snapshotFor('user-a', { subscriptionState });
    snapshot.lineItems[0].expiryTime = expiry;
    const result = await harness.service.processDeveloperNotification(token);
    assert.equal(result.processed, true);
    assert.equal(result.entitlement.entitlementState, expectedState);
    assert.equal(result.entitlement.entitlementActive, active);
    assert.equal(normalizeEntitlement(result.entitlement, now).active, active);
    assert.equal(harness.documents[0].subscriptionState, subscriptionState);
    assert.equal(harness.userUpdates.at(-1).update.$set.subscriptionStatus, active ? 'active' : 'expired');
  }
});

test('RTDN links replacement tokens to the same account and ignores unrecognized tokens', async () => {
  const oldToken = 'replaced-play-token-'.padEnd(64, 'o');
  const newToken = 'replacement-play-token-'.padEnd(64, 'n');
  const harness = modelHarness({
    documents: [{ user: 'user-a', purchaseToken: oldToken, purchaseTokenHash: purchaseTokenHash(oldToken) }],
    loadSnapshot: async () => snapshotFor('user-a', { linkedPurchaseToken: oldToken }),
  });
  assert.equal((await harness.service.processDeveloperNotification(newToken)).processed, true);
  assert.equal(harness.documents.length, 1);
  assert.equal(harness.documents[0].purchaseToken, newToken);
  assert.equal(harness.documents[0].purchaseTokenHash, purchaseTokenHash(newToken));
  const unknown = modelHarness({ loadSnapshot: async () => snapshotFor('user-a') });
  assert.deepEqual(await unknown.service.processDeveloperNotification(newToken), { processed: false, reconciliationPending: true });
  assert.equal(unknown.documents.length, 0);
  assert.equal(unknown.userUpdates.length, 0);
});

test('status refresh preserves only the already verified unexpired period during API outages', async () => {
  const token = 'status-play-token-'.padEnd(64, 's');
  for (const [expiry, expectedState, active] of [
    [future, STATES.ACTIVE, true],
    [past, STATES.EXPIRED, false],
  ]) {
    const harness = modelHarness({
      documents: [{
        user: 'user-a', purchaseToken: token, purchaseTokenHash: purchaseTokenHash(token),
        productId: GOOGLE_PLAY_PRODUCT_ID, entitlementState: STATES.ACTIVE, expiresAt: expiry,
      }],
      loadSnapshot: async () => { throw new GooglePlayIapError('unavailable', 503, 'GOOGLE_PLAY_API_UNAVAILABLE'); },
    });
    const response = await harness.service.statusForUser('user-a');
    assert.equal(response.refreshStatus, 'temporarily_unavailable');
    assert.equal(response.entitlementActive, active);
    assert.equal(response.entitlementState, expectedState);
    assert.equal(response.obfuscatedAccountId, obfuscatedAccountIdForUser('user-a'));
    assert.equal(harness.userUpdates.length, 0);
  }
  const missing = modelHarness({ loadSnapshot: async () => assert.fail('No purchase to refresh') });
  const response = await missing.service.statusForUser('user-a');
  assert.equal(response.refreshStatus, 'not_purchased');
  assert.equal(response.entitlementState, STATES.NONE);
  assert.equal(response.entitlementActive, false);
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

test('server acknowledges only verified, owned, persisted paid purchases and replays are idempotent', async () => {
  const token = 'acknowledgement-token-'.padEnd(64, 'a');
  const harness = modelHarness({ loadSnapshot: async () => snapshotFor('user-a'), acknowledge: async value => {
    assert.equal(value, token);
    assert.equal(harness.documents[0].purchaseTokenHash, purchaseTokenHash(token));
    assert.equal(harness.userUpdates.at(-1).update.$set.subscriptionStatus, 'active');
  } });
  const result = await harness.service.verifyClientPurchase('user-a', token);
  assert.equal(result.acknowledgementState, 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED');
  await harness.service.verifyClientPurchase('user-a', token);
  assert.equal(harness.acknowledgements.length, 1);
  assert.equal(harness.documents.length, 1);
  for (const state of ['SUBSCRIPTION_STATE_PENDING', 'SUBSCRIPTION_STATE_ON_HOLD', 'SUBSCRIPTION_STATE_EXPIRED']) {
    const pending = modelHarness({ loadSnapshot: async () => snapshotFor('user-a', { subscriptionState: state }) });
    assert.equal((await pending.service.verifyClientPurchase('user-a', token)).entitlementActive, false);
    assert.equal(pending.acknowledgements.length, 0);
  }
  const wrong = modelHarness({ loadSnapshot: async () => snapshotFor('other-user') });
  await assert.rejects(wrong.service.verifyClientPurchase('user-a', token), { code: 'GOOGLE_PLAY_ACCOUNT_MISMATCH' });
  assert.equal(wrong.acknowledgements.length, 0);
});

test('acknowledgement uses the official API and verifies ambiguous errors before accepting success', async () => {
  const token = 'ack-token/with+special?characters';
  const accountId = obfuscatedAccountIdForUser('user-a');
  const requests = [];
  const factory = async () => ({ request: async request => {
    requests.push(request);
    if (request.method === 'POST') throw new Error('concurrent acknowledgement');
    return { data: snapshotFor('user-a', { acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' }) };
  } });
  await acknowledgeSubscription(token, accountId, true, factory);
  assert.equal(requests[0].url, `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(GOOGLE_PLAY_PACKAGE_NAME)}/purchases/subscriptions/${encodeURIComponent(GOOGLE_PLAY_PRODUCT_ID)}/tokens/${encodeURIComponent(token)}:acknowledge`);
  assert.deepEqual(requests[0].data, { externalAccountIds: { obfuscatedAccountId: accountId } });
  assert.equal(requests[0].timeout, 15_000);
  assert.equal(requests[0].retry, false);
  assert.equal(requests[1].method, 'GET');
  await assert.rejects(acknowledgeSubscription(token, accountId, false, async () => ({ request: async request => {
    if (request.method === 'POST') throw new Error('unavailable');
    return { data: snapshotFor('user-a') };
  } })), { code: 'GOOGLE_PLAY_ACKNOWLEDGEMENT_PENDING' });
});

test('temporary acknowledgement failure is durable and worker retries after app interruption', async () => {
  const token = 'retry-ack-token-'.padEnd(64, 'r');
  let time = now;
  let available = false;
  const harness = modelHarness({ currentTime: () => time, loadSnapshot: async () => snapshotFor('user-a'),
    acknowledge: async () => { if (!available) throw new GooglePlayIapError('unavailable', 503, 'GOOGLE_PLAY_API_UNAVAILABLE'); } });
  const response = await harness.service.verifyClientPurchase('user-a', token);
  assert.equal(response.entitlementActive, true);
  assert.equal(response.acknowledgementState, 'ACKNOWLEDGEMENT_STATE_PENDING');
  assert.equal(harness.work[0].state, 'pending');
  assert.equal(harness.work[0].user, 'user-a');
  assert.equal(harness.work[0].reason, 'GOOGLE_PLAY_ACKNOWLEDGEMENT_PENDING');
  available = true;
  time += 3 * 60_000;
  const result = await harness.service.reconcileDuePurchases();
  assert.deepEqual(result, { checked: 1, processed: 1 });
  assert.equal(harness.documents[0].acknowledgementState, 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED');
  assert.equal(harness.work[0].state, 'verified');
  assert.equal(harness.acknowledgements.length, 2);
});

test('unknown notifications remain unresolved without guessing ownership and can be reconciled after verification', async () => {
  const token = 'unknown-notification-'.padEnd(64, 'u');
  const harness = modelHarness({ loadSnapshot: async () => snapshotFor('user-a') });
  const result = await harness.service.processDeveloperNotification(token);
  assert.equal(result.reconciliationPending, true);
  assert.equal(harness.work[0].state, 'unresolved');
  assert.equal(harness.work[0].user, undefined);
  assert.equal(harness.documents.length, 0);
  assert.equal(harness.acknowledgements.length, 0);
  assert.equal(harness.warnings.some(message => message.includes(token)), false);
  await harness.service.verifyClientPurchase('user-a', token);
  await harness.service.processDeveloperNotification(token);
  assert.equal(harness.documents.length, 1);
  assert.equal(harness.work[0].state, 'verified');
  assert.equal(harness.work[0].user, 'user-a');
  assert.equal(harness.acknowledgements.length, 1);
});

test('out-of-app replacement uses Google-verified expired token/account binding and preserves old token ownership', async () => {
  const oldToken = 'expired-token-'.padEnd(64, 'o');
  const token = 'resubscribed-token-'.padEnd(64, 'n');
  const harness = modelHarness({
    documents: [{ user: 'user-a', purchaseToken: oldToken, purchaseTokenHash: purchaseTokenHash(oldToken), expiresAt: past, entitlementState: STATES.EXPIRED }],
    loadSnapshot: async () => snapshotFor('user-a', {
      externalAccountIdentifiers: undefined,
      outOfAppPurchaseContext: { expiredPurchaseToken: oldToken,
        expiredExternalAccountIdentifiers: { obfuscatedExternalAccountId: obfuscatedAccountIdForUser('user-a') } },
    }),
  });
  const result = await harness.service.processDeveloperNotification(token);
  assert.equal(result.entitlement.entitlementActive, true);
  assert.equal(harness.documents[0].purchaseToken, token);
  assert.equal(harness.acknowledgements[0][2], true);
  assert.equal(harness.work.find(item => item._id === purchaseTokenHash(oldToken)).user, 'user-a');
});

test('voided subscription notifications refresh Google; refund-only retains access and revocation removes it', async () => {
  const token = 'voided-token-'.padEnd(64, 'v');
  const encode = payload => ({ message: { data: Buffer.from(JSON.stringify({ packageName: GOOGLE_PLAY_PACKAGE_NAME, ...payload })).toString('base64') } });
  const decoded = decodeGooglePlayRtdnMessage(encode({ voidedPurchaseNotification: { purchaseToken: token, productType: 1, refundType: 1 } }));
  assert.deepEqual(decoded, { test: false, purchaseToken: token, voided: true });
  assert.equal(decodeGooglePlayRtdnMessage(encode({ voidedPurchaseNotification: { productType: 2 } })).ignored, true);
  let snapshot = snapshotFor('user-a', { acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' });
  const harness = modelHarness({ documents: [{ user: 'user-a', purchaseToken: token, purchaseTokenHash: purchaseTokenHash(token) }], loadSnapshot: async () => snapshot });
  assert.equal((await harness.service.processDeveloperNotification(decoded.purchaseToken)).entitlement.entitlementActive, true);
  snapshot = { ...snapshot, subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' };
  assert.equal((await harness.service.processDeveloperNotification(decoded.purchaseToken)).entitlement.entitlementActive, false);
  assert.equal(harness.acknowledgements.length, 0);
});

test('concurrent stale fetch cannot overwrite newer Google state and retries from Google', async () => {
  const token = 'concurrent-state-token-'.padEnd(64, 'c');
  let releaseFirst;
  let firstStarted;
  const started = new Promise(resolve => { firstStarted = resolve; });
  let calls = 0;
  const harness = modelHarness({ loadSnapshot: async () => {
    calls += 1;
    if (calls === 1) { firstStarted(); return new Promise(resolve => { releaseFirst = resolve; }); }
    return snapshotFor('user-a', { subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' });
  } });
  const first = harness.service.verifyClientPurchase('user-a', token);
  await started;
  const second = await harness.service.verifyClientPurchase('user-a', token);
  assert.equal(second.entitlementActive, false);
  releaseFirst(snapshotFor('user-a'));
  assert.equal((await first).entitlementActive, false);
  assert.equal(harness.documents[0].entitlementState, STATES.EXPIRED);
  assert.equal(harness.acknowledgements.length, 0);
  assert.equal(calls, 3);
});

test('concurrent acknowledgement uses one lease and newer queued work survives older completion', async () => {
  const token = 'concurrent-ack-token-'.padEnd(64, 'a');
  let releaseAck;
  let ackStarted;
  const started = new Promise(resolve => { ackStarted = resolve; });
  const harness = modelHarness({ loadSnapshot: async () => snapshotFor('user-a'), acknowledge: async () => {
    ackStarted(); await new Promise(resolve => { releaseAck = resolve; });
  } });
  const first = harness.service.verifyClientPurchase('user-a', token);
  await started;
  const second = await harness.service.verifyClientPurchase('user-a', token);
  assert.equal(second.acknowledgementState, 'ACKNOWLEDGEMENT_STATE_PENDING');
  releaseAck();
  assert.equal((await first).acknowledgementState, 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED');
  assert.equal(harness.acknowledgements.length, 1);
  assert.equal(harness.work[0].state, 'pending');
  await harness.service.verifyClientPurchase('user-a', token);
  assert.equal(harness.acknowledgements.length, 1);
  assert.equal(harness.work[0].state, 'verified');
});

test('out-of-order retired token refreshes current purchase and never restores old entitlement', async () => {
  const old = 'retired-token-'.padEnd(64, 'o');
  const current = 'current-token-'.padEnd(64, 'n');
  const harness = modelHarness({ documents: [{ user: 'user-a', purchaseToken: old, purchaseTokenHash: purchaseTokenHash(old), expiresAt: future }],
    loadSnapshot: async token => snapshotFor('user-a', token === current
      ? { linkedPurchaseToken: old, subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' }
      : { subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE' }),
  });
  await harness.service.verifyClientPurchase('user-a', current);
  const response = await harness.service.processDeveloperNotification(old);
  assert.equal(response.entitlement.entitlementActive, false);
  assert.equal(harness.documents[0].purchaseToken, current);
  assert.equal(harness.documents[0].entitlementState, STATES.EXPIRED);
  assert.equal(harness.acknowledgements.length, 0);
});

test('missed notifications are reconciled in bounded batches from stale Google records', async () => {
  const tokens = ['stale-one-', 'stale-two-'].map(value => value.padEnd(64, 's'));
  const harness = modelHarness({ documents: tokens.map((purchaseToken, index) => ({
    user: `user-${index}`, purchaseToken, purchaseTokenHash: purchaseTokenHash(purchaseToken), expiresAt: future,
    lastVerifiedAt: new Date(now - 30 * 60_000), entitlementState: STATES.ACTIVE,
  })), loadSnapshot: async token => snapshotFor(`user-${tokens.indexOf(token)}`, { subscriptionState: 'SUBSCRIPTION_STATE_ON_HOLD' }) });
  const result = await harness.service.reconcileDuePurchases({ limit: 1 });
  assert.deepEqual(result, { checked: 1, processed: 1 });
  assert.equal(harness.documents[0].entitlementState, STATES.BILLING_RETRY);
  assert.equal(harness.documents[1].entitlementState, STATES.ACTIVE);
  await harness.service.reconcileDuePurchases({ limit: 1 });
  assert.equal(harness.documents[1].entitlementState, STATES.BILLING_RETRY);
});

test('unresolved retries stop after bounded attempts, and historical offer periods are never rewritten', async () => {
  const token = 'historical-offer-token-'.padEnd(64, 'h');
  const harness = modelHarness({ work: [{ _id: purchaseTokenHash(token), purchaseToken: token, state: 'unresolved', attempts: 23, generation: 23 }],
    loadSnapshot: async () => {
      const snapshot = snapshotFor('user-a');
      snapshot.lineItems[0].offerDetails.offerId = 'new-subscriber-1rs-24h';
      snapshot.lineItems[0].expiryTime = new Date(now + 24 * 60 * 60_000).toISOString();
      return snapshot;
    },
  });
  await harness.service.processDeveloperNotification(token);
  assert.equal(harness.work[0].state, 'blocked');
  assert.equal(harness.work[0].nextAttemptAt, null);
  const restored = await harness.service.verifyClientPurchase('user-a', token);
  assert.equal(restored.entitlementActive, true);
  assert.equal(restored.offerId, 'new-subscriber-1rs-24h');
  assert.equal(new Date(restored.expiresAt).getTime(), now + 24 * 60 * 60_000);
});

test('worker recovers interrupted initial verification using a persisted candidate only after Google binding validation', async () => {
  const token = 'interrupted-first-purchase-'.padEnd(64, 'i');
  let time = now;
  let available = false;
  const harness = modelHarness({ currentTime: () => time, loadSnapshot: async () => {
    if (!available) throw new GooglePlayIapError('timeout', 503, 'GOOGLE_PLAY_API_UNAVAILABLE');
    return snapshotFor('user-a');
  } });
  await assert.rejects(harness.service.verifyClientPurchase('user-a', token), { code: 'GOOGLE_PLAY_API_UNAVAILABLE' });
  assert.equal(harness.documents.length, 0);
  assert.equal(harness.work[0].candidateUser, 'user-a');
  assert.equal(harness.work[0].user, undefined);
  assert.equal(harness.acknowledgements.length, 0);
  available = true;
  time += 3 * 60_000;
  assert.equal((await harness.service.reconcileDuePurchases()).processed, 1);
  assert.equal(harness.documents[0].user, 'user-a');
  assert.equal(harness.acknowledgements.length, 1);
  assert.equal(harness.work[0].candidateUser, null);

  const mismatch = modelHarness({ work: [{ _id: purchaseTokenHash(token), purchaseToken: token,
    candidateUser: 'wrong-user', state: 'pending', nextAttemptAt: new Date(now), attempts: 1, generation: 1 }],
  loadSnapshot: async () => snapshotFor('user-a') });
  assert.equal((await mismatch.service.reconcileDuePurchases()).processed, 0);
  assert.equal(mismatch.documents.length, 0);
  assert.equal(mismatch.acknowledgements.length, 0);
  assert.equal(mismatch.work[0].state, 'unresolved');
});

test('wrong-account submissions cannot alter a verified owners pending retry work', async () => {
  const token = 'owned-retry-purchase-'.padEnd(64, 'o');
  const harness = modelHarness({ documents: [{ user: 'user-a', purchaseToken: token, purchaseTokenHash: purchaseTokenHash(token) }],
    work: [{ _id: purchaseTokenHash(token), purchaseToken: token, user: 'user-a', state: 'pending',
      nextAttemptAt: new Date(now + 60_000), generation: 3, attempts: 3 }],
    loadSnapshot: async () => assert.fail('Foreign owner must be rejected before Google or queue work'),
  });
  const original = { ...harness.work[0] };
  await assert.rejects(harness.service.verifyClientPurchase('user-b', token), { code: 'GOOGLE_PLAY_PURCHASE_OWNERSHIP' });
  assert.deepEqual(harness.work[0], original);
});

test('ownership established between preflight and enqueue cannot be replaced by a foreign candidate', async () => {
  const token = 'racing-owner-token-'.padEnd(64, 'r');
  const harness = modelHarness({ loadSnapshot: async () => assert.fail('The foreign submitter must not reach Google') });
  const update = harness.models.GooglePlayReconciliation.findOneAndUpdate;
  let established = false;
  harness.models.GooglePlayReconciliation.findOneAndUpdate = async (query, value, options) => {
    if (!established) {
      established = true;
      harness.work.push({ _id: purchaseTokenHash(token), purchaseToken: token, user: 'user-a', state: 'pending', generation: 2 });
    }
    return update(query, value, options);
  };
  await assert.rejects(harness.service.verifyClientPurchase('user-b', token), { code: 'GOOGLE_PLAY_QUEUE_CONFLICT' });
  assert.equal(harness.work[0].user, 'user-a');
  assert.equal(harness.work[0].candidateUser, undefined);
  assert.equal(harness.work[0].generation, 2);
});

test('a concurrent revocation during acknowledgement is reflected in the verification response', async () => {
  const token = 'revoke-during-ack-'.padEnd(64, 'r');
  let releaseAck;
  let startedAck;
  const started = new Promise(resolve => { startedAck = resolve; });
  let revoked = false;
  const harness = modelHarness({ loadSnapshot: async () => snapshotFor('user-a', revoked
    ? { subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' } : {}),
  acknowledge: async () => { startedAck(); await new Promise(resolve => { releaseAck = resolve; }); } });
  const first = harness.service.verifyClientPurchase('user-a', token);
  await started;
  revoked = true;
  assert.equal((await harness.service.processDeveloperNotification(token)).entitlement.entitlementActive, false);
  releaseAck();
  assert.equal((await first).entitlementActive, false);
  assert.equal(harness.documents[0].entitlementState, STATES.EXPIRED);
});

test('ambiguous acknowledgement response applies its freshly verified revoked state', async () => {
  const token = 'ambiguous-revoked-ack-'.padEnd(64, 'r');
  const harness = modelHarness({ loadSnapshot: async () => snapshotFor('user-a'),
    acknowledge: async () => snapshotFor('user-a', {
      subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    }) });
  const response = await harness.service.verifyClientPurchase('user-a', token);
  assert.equal(response.entitlementActive, false);
  assert.equal(response.entitlementState, STATES.EXPIRED);
});

test('failure marking queue completion leaves recoverable work and does not duplicate acknowledgement', async () => {
  const token = 'completion-interrupted-'.padEnd(64, 'f');
  let time = now;
  const harness = modelHarness({ currentTime: () => time, loadSnapshot: async () => snapshotFor('user-a') });
  const update = harness.models.GooglePlayReconciliation.updateOne;
  let failed = false;
  harness.models.GooglePlayReconciliation.updateOne = async (query, value) => {
    if (value.$set?.state === 'verified' && !failed) { failed = true; throw new Error('temporary database outage'); }
    return update(query, value);
  };
  await assert.rejects(harness.service.verifyClientPurchase('user-a', token), /temporary database outage/);
  assert.equal(harness.work[0].state, 'pending');
  assert.equal(harness.documents[0].acknowledgementState, 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED');
  time += 3 * 60_000;
  assert.equal((await harness.service.reconcileDuePurchases()).processed, 1);
  assert.equal(harness.acknowledgements.length, 1);
  assert.equal(harness.work[0].state, 'verified');
});

test('queued candidates for deleted or disabled users cannot recreate an entitlement or acknowledge', async () => {
  const token = 'deleted-user-purchase-'.padEnd(64, 'd');
  for (const user of [null, { _id: 'user-a', isActive: false }]) {
    const harness = modelHarness({ work: [{ _id: purchaseTokenHash(token), purchaseToken: token,
      candidateUser: 'user-a', state: 'pending', nextAttemptAt: new Date(now), attempts: 1, generation: 1 }],
    loadSnapshot: async () => snapshotFor('user-a') });
    harness.models.User.findById = async () => user;
    assert.equal((await harness.service.reconcileDuePurchases()).processed, 0);
    assert.equal(harness.documents.length, 0);
    assert.equal(harness.acknowledgements.length, 0);
    assert.equal(harness.work[0].state, 'blocked');
  }
});

test('duplicate inbox upsert retries its existing unique token record without duplicating entitlement', async () => {
  const token = 'duplicate-inbox-token-'.padEnd(64, 'q');
  const harness = modelHarness({ loadSnapshot: async () => snapshotFor('user-a') });
  const update = harness.models.GooglePlayReconciliation.findOneAndUpdate;
  let duplicate = false;
  harness.models.GooglePlayReconciliation.findOneAndUpdate = async (query, value, options) => {
    if (!duplicate) {
      duplicate = true;
      await update(query, value, options);
      throw { code: 11000 };
    }
    return update(query, value, options);
  };
  assert.equal((await harness.service.verifyClientPurchase('user-a', token)).entitlementActive, true);
  assert.equal(harness.work.length, 1);
  assert.equal(harness.documents.length, 1);
});

test('reconciliation stops starting work after its time budget and leaves the rest queued', async () => {
  let time = now;
  const tokens = ['deadline-first-', 'deadline-second-'].map(value => value.padEnd(64, 'd'));
  const harness = modelHarness({ currentTime: () => time,
    work: tokens.map(purchaseToken => ({ _id: purchaseTokenHash(purchaseToken), purchaseToken,
      state: 'pending', nextAttemptAt: new Date(now), generation: 1, attempts: 1 })),
    loadSnapshot: async () => { time += 3 * 60_000; return snapshotFor('user-a'); },
  });
  assert.deepEqual(await harness.service.reconcileDuePurchases(), { checked: 1, processed: 0 });
  assert.equal(harness.work[1].generation, 1);
  assert.equal(harness.work[1].state, 'pending');
});

test('RTDN rejects missing or invalid authentication, unverified senders, and malformed payloads', async () => {
  const options = {
    audience: 'https://api.skillomate.in/api/google-play-iap/notifications',
    serviceAccountEmail: 'pubsub@example.iam.gserviceaccount.com',
    client: { verifyIdToken: async () => { throw new Error('bad signature'); } },
  };
  await assert.rejects(verifyGooglePlayPubSubAuthorization('', options), error => error.code === 'GOOGLE_PLAY_RTDN_AUTH_REQUIRED');
  await assert.rejects(verifyGooglePlayPubSubAuthorization('Bearer invalid', options), error => error.code === 'GOOGLE_PLAY_RTDN_AUTH_INVALID');
  await assert.rejects(verifyGooglePlayPubSubAuthorization('Bearer token', {
    ...options,
    client: { verifyIdToken: async () => ({ getPayload: () => ({ email: options.serviceAccountEmail, email_verified: false }) }) },
  }), error => error.code === 'GOOGLE_PLAY_RTDN_SENDER_MISMATCH');
  await assert.rejects(verifyGooglePlayPubSubAuthorization('Bearer token', { ...options, audience: '' }), error => error.code === 'GOOGLE_PLAY_RTDN_NOT_CONFIGURED');
  for (const body of [{}, { message: { data: 'not json' } }, { message: { data: 'x'.repeat(65537) } }]) {
    assert.throws(() => decodeGooglePlayRtdnMessage(body), error => error.code === 'GOOGLE_PLAY_RTDN_INVALID');
  }
  const encode = payload => ({ message: { data: Buffer.from(JSON.stringify(payload)).toString('base64') } });
  assert.throws(() => decodeGooglePlayRtdnMessage(encode({
    packageName: GOOGLE_PLAY_PACKAGE_NAME, subscriptionNotification: { purchaseToken: 'short' },
  })), error => error.code === 'GOOGLE_PLAY_RTDN_TOKEN_INVALID');
  assert.deepEqual(decodeGooglePlayRtdnMessage(encode({
    packageName: GOOGLE_PLAY_PACKAGE_NAME, testNotification: { version: '1.0' },
  })), { test: true, purchaseToken: null });
});
