const test = require('node:test');
const assert = require('node:assert/strict');

const { APPLE_PRODUCT_ID, STATES, deriveAppleEntitlement } = require('../services/appleEntitlement');
const { AppleIapError, createAppleIapService } = require('../services/appleIapService');

const now = Date.parse('2026-09-25T12:00:00Z');
const future = now + 30 * 24 * 60 * 60 * 1000;

function modelHarness({ account, verifyPayload, serverResponse } = {}) {
  let subscription = { user: 'user-a', appAccountToken: '11111111-1111-4111-8111-111111111111', entitlementState: 'NONE', ...account };
  const transactions = new Map();
  const notifications = new Map();
  const AppleSubscription = {
    findOne: async query => query.user ? (String(query.user) === String(subscription.user) ? subscription : null)
      : query.originalTransactionId === subscription.originalTransactionId || query.appAccountToken === subscription.appAccountToken ? subscription : null,
    create: async value => { subscription = { ...value, entitlementState: 'NONE' }; return subscription; },
    findOneAndUpdate: async (_query, update) => { subscription = { ...subscription, ...update.$set }; return subscription; },
  };
  const AppleTransaction = {
    findOne: async query => transactions.get(query.transactionId) || null,
    create: async value => { transactions.set(value.transactionId, value); return value; },
  };
  const AppleNotification = {
    findOne: async query => notifications.get(query.notificationUUID) || null,
    create: async value => { notifications.set(value.notificationUUID, value); return value; },
  };
  const User = { updateOne: async () => ({ modifiedCount: 1 }) };
  const service = createAppleIapService({
    AppleSubscription, AppleTransaction, AppleNotification, User,
    now: () => now,
    verifyPayload,
    serverApiClientFactory: () => serverResponse ? { getAllSubscriptionStatuses: async () => serverResponse } : null,
  });
  return { service, transactions, get subscription() { return subscription; } };
}

function transaction(overrides = {}) {
  return {
    bundleId: 'com.alihussainkhan.edunexfinal',
    productId: APPLE_PRODUCT_ID,
    transactionId: 'tx-1',
    originalTransactionId: 'original-1',
    appAccountToken: '11111111-1111-4111-8111-111111111111',
    purchaseDate: now - 1000,
    expiresDate: future,
    environment: 'Sandbox',
    ...overrides,
  };
}

test('Apple entitlement state machine grants only active, cancel-at-period-end and grace periods', () => {
  assert.equal(deriveAppleEntitlement({ transaction: transaction(), now }).entitlementState, STATES.ACTIVE);
  assert.equal(deriveAppleEntitlement({ transaction: transaction(), renewal: { autoRenewStatus: 0 }, now }).entitlementState, STATES.ACTIVE_CANCELS_AT_PERIOD_END);
  assert.equal(deriveAppleEntitlement({ transaction: transaction({ expiresDate: now - 1 }), renewal: { gracePeriodExpiresDate: future }, storeStatus: 4, now }).entitlementState, STATES.GRACE_PERIOD);
  for (const [status, expected] of [[2, STATES.EXPIRED], [3, STATES.BILLING_RETRY], [5, STATES.REVOKED]]) {
    const value = deriveAppleEntitlement({ transaction: transaction(), storeStatus: status, now });
    assert.equal(value.entitlementState, expected);
    assert.equal(value.entitlementActive, false);
  }
  assert.equal(deriveAppleEntitlement({ transaction: transaction(), notificationType: 'REFUND', now }).entitlementState, STATES.REFUNDED);
});

test('server verification checks current Apple status, is idempotent, and rejects mismatches', async () => {
  let decoded = transaction();
  const harness = modelHarness({
    verifyPayload: async () => ({ decoded }),
    serverResponse: { data: [{ lastTransactions: [{ status: 1, signedTransactionInfo: 'signed-tx' }] }] },
  });
  const first = await harness.service.verifyClientTransaction('user-a', 'x'.repeat(120));
  const duplicate = await harness.service.verifyClientTransaction('user-a', 'x'.repeat(120));
  assert.equal(first.entitlementActive, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(harness.transactions.size, 1);

  for (const bad of [
    { bundleId: 'wrong.bundle' },
    { productId: 'wrong.product' },
    { appAccountToken: '22222222-2222-4222-8222-222222222222' },
  ]) {
    decoded = transaction({ transactionId: `bad-${Object.keys(bad)[0]}`, ...bad });
    await assert.rejects(harness.service.verifyClientTransaction('user-a', 'x'.repeat(120)), AppleIapError);
  }
  harness.transactions.set('replayed', { transactionId: 'replayed', user: 'user-b' });
  decoded = transaction({ transactionId: 'replayed' });
  await assert.rejects(harness.service.verifyClientTransaction('user-a', 'x'.repeat(120)), /another account/);
});

test('client replay cannot reactivate a server-recorded refund or revocation', async () => {
  for (const entitlementState of [STATES.REFUNDED, STATES.REVOKED]) {
    const harness = modelHarness({
      account: {
        entitlementState,
        entitlementActive: false,
        expiresAt: new Date(future),
        originalTransactionId: 'original-1',
      },
      verifyPayload: async () => ({ decoded: transaction() }),
      serverResponse: { data: [{ lastTransactions: [{ status: 5, signedTransactionInfo: 'signed-tx' }] }] },
    });
    const result = await harness.service.verifyClientTransaction('user-a', 'x'.repeat(120));
    assert.equal(result.entitlementActive, false);
    assert.equal(result.entitlementState, STATES.REVOKED);
  }
});

test('signed client transaction does not activate Premium when Apple status API is unavailable', async () => {
  const harness = modelHarness({ verifyPayload: async () => ({ decoded: transaction() }) });
  await assert.rejects(harness.service.verifyClientTransaction('user-a', 'x'.repeat(120)), /not configured/);
  assert.equal(harness.subscription.entitlementState, STATES.NONE);
  assert.equal(harness.transactions.size, 0);
});

test('older signed notifications cannot overwrite a newer Apple status snapshot', async () => {
  const tx = transaction();
  const verifier = { verifyAndDecodeTransaction: async () => tx };
  const notification = {
    notificationUUID: 'stale-notification', notificationType: 'DID_RENEW', signedDate: now - 1000,
    data: { signedTransactionInfo: 'signed-tx', status: 1, environment: 'Sandbox' },
  };
  const harness = modelHarness({
    account: { originalTransactionId: tx.originalTransactionId, entitlementState: STATES.REVOKED,
      entitlementActive: false, expiresAt: new Date(future), lastStoreSnapshotAt: new Date(now) },
    verifyPayload: async (_method, payload) => payload === 'current-tx'
      ? { decoded: transaction({ revocationDate: now }) }
      : { decoded: notification, verifier },
    serverResponse: { data: [{ lastTransactions: [{ status: 5, signedTransactionInfo: 'current-tx' }] }] },
  });
  await harness.service.processNotification('x'.repeat(120));
  assert.equal(harness.subscription.entitlementState, STATES.REVOKED);
  assert.equal(harness.subscription.entitlementActive, false);
});

test('App Store Server API refresh verifies signed status and persists cancellation-at-period-end', async () => {
  const tx = transaction();
  const renewal = { originalTransactionId: tx.originalTransactionId, autoRenewStatus: 0 };
  const verifyPayload = async (method, payload) => ({ decoded: payload === 'signed-tx' ? tx : renewal });
  const harness = modelHarness({
    account: { originalTransactionId: tx.originalTransactionId, environment: 'Sandbox' },
    verifyPayload,
    serverResponse: { data: [{ lastTransactions: [{ status: 1, signedTransactionInfo: 'signed-tx', signedRenewalInfo: 'signed-renewal' }] }] },
  });
  const status = await harness.service.statusForUser('user-a');
  assert.equal(status.refreshStatus, 'verified');
  assert.equal(status.entitlementState, STATES.ACTIVE_CANCELS_AT_PERIOD_END);
  assert.equal(status.entitlementActive, true);
});

test('Apple status refresh selects the newest renewal and removes access after expiration or refund', async () => {
  let statusCode = 1;
  let latest = transaction({ transactionId: 'renewed', purchaseDate: now - 500, expiresDate: future });
  const old = transaction({ transactionId: 'initial', purchaseDate: now - 1000, expiresDate: now - 100 });
  const harness = modelHarness({
    account: { originalTransactionId: 'original-1', environment: 'Sandbox' },
    verifyPayload: async (_method, payload) => ({ decoded: payload === 'old' ? old : latest }),
    serverResponse: { data: [{ lastTransactions: [
      { status: 2, signedTransactionInfo: 'old' },
      { get status() { return statusCode; }, signedTransactionInfo: 'latest' },
    ] }] },
  });
  const renewal = await harness.service.statusForUser('user-a');
  assert.equal(renewal.entitlementActive, true);
  assert.equal(harness.subscription.latestTransactionId, 'renewed');

  statusCode = 2;
  latest = transaction({ transactionId: 'renewed', purchaseDate: now - 500, expiresDate: now - 1 });
  const expiration = await harness.service.statusForUser('user-a');
  assert.equal(expiration.entitlementState, STATES.EXPIRED);
  assert.equal(expiration.entitlementActive, false);

  statusCode = 5;
  latest = transaction({ transactionId: 'renewed', purchaseDate: now - 500, expiresDate: future, revocationDate: now });
  const refund = await harness.service.statusForUser('user-a');
  assert.equal(refund.entitlementActive, false);
  assert.equal(refund.entitlementState, STATES.REVOKED);
});

test('notification processing is idempotent and never trusts an unverified inner transaction', async () => {
  const tx = transaction();
  const verifier = {
    verifyAndDecodeTransaction: async () => tx,
    verifyAndDecodeRenewalInfo: async () => ({ autoRenewStatus: 1 }),
  };
  const notification = {
    notificationUUID: 'notification-1', notificationType: 'DID_RENEW',
    data: { signedTransactionInfo: 'inner-tx', signedRenewalInfo: 'inner-renewal', environment: 'Sandbox' },
  };
  const harness = modelHarness({
    account: { originalTransactionId: tx.originalTransactionId },
    verifyPayload: async (_method, payload) => payload === 'current-tx'
      ? { decoded: tx }
      : { decoded: notification, verifier },
    serverResponse: { data: [{ lastTransactions: [{ status: 1, signedTransactionInfo: 'current-tx' }] }] },
  });
  assert.deepEqual(await harness.service.processNotification('x'.repeat(120)), { duplicate: false, processed: true });
  assert.deepEqual(await harness.service.processNotification('x'.repeat(120)), { duplicate: true, processed: true });
});
