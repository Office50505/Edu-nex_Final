const crypto = require('node:crypto');
const { GoogleAuth } = require('google-auth-library');
const GooglePlaySubscription = require('../models/GooglePlaySubscription');
const GooglePlayReconciliation = require('../models/GooglePlayReconciliation');
const User = require('../models/User');
const { syncUserSubscriptionMirror } = require('./subscriptionMirror');
const {
  GOOGLE_PLAY_PACKAGE_NAME,
  GOOGLE_PLAY_PRODUCT_ID,
  deriveGooglePlayEntitlement,
  publicGooglePlayEntitlement,
} = require('./googlePlayEntitlement');

const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

class GooglePlayIapError extends Error {
  constructor(message, statusCode = 400, code = 'GOOGLE_PLAY_IAP_ERROR') {
    super(message);
    this.name = 'GooglePlayIapError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function purchaseTokenHash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function obfuscatedAccountIdForUser(userId) {
  return crypto.createHash('sha256').update(`skillomate:${String(userId)}`).digest('hex');
}

function serviceAccountCredentials() {
  const base64 = String(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64 || '').trim();
  const raw = base64
    ? Buffer.from(base64, 'base64').toString('utf8')
    : String(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.private_key) parsed.private_key = String(parsed.private_key).replace(/\\n/g, '\n');
    return parsed;
  } catch (_) {
    throw new GooglePlayIapError('Google Play verification credentials are invalid.', 503, 'GOOGLE_PLAY_CREDENTIALS_INVALID');
  }
}

let clientPromise;
async function createGooglePlayApiClient() {
  if (clientPromise) return clientPromise;
  const credentials = serviceAccountCredentials();
  if (!credentials) return null;
  clientPromise = new GoogleAuth({ credentials, scopes: [ANDROID_PUBLISHER_SCOPE] }).getClient()
    .catch(error => { clientPromise = null; throw error; });
  return clientPromise;
}

async function acknowledgeSubscription(purchaseToken, accountId, isResubscription = false, clientFactory = createGooglePlayApiClient) {
  const client = await clientFactory();
  if (!client) throw new GooglePlayIapError('Google Play acknowledgement is not configured.', 503, 'GOOGLE_PLAY_API_NOT_CONFIGURED');
  try {
    await client.request({
      method: 'POST',
      timeout: 15_000,
      retry: false,
      url: `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(GOOGLE_PLAY_PACKAGE_NAME)}/purchases/subscriptions/${encodeURIComponent(GOOGLE_PLAY_PRODUCT_ID)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
      data: isResubscription ? { externalAccountIds: { obfuscatedAccountId: accountId } } : {},
    });
  } catch (_) {
    // A concurrent client/server acknowledgement may have succeeded. Only a fresh
    // verified response, never an HTTP error code alone, proves acknowledgement.
    const latest = await fetchSubscriptionSnapshot(purchaseToken, clientFactory);
    validateSnapshot(latest, accountId);
    if (latest.acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED') {
      throw new GooglePlayIapError('Google Play acknowledgement will be retried.', 503, 'GOOGLE_PLAY_ACKNOWLEDGEMENT_PENDING');
    }
    return latest;
  }
}

async function fetchSubscriptionSnapshot(purchaseToken, clientFactory = createGooglePlayApiClient) {
  const client = await clientFactory();
  if (!client) {
    throw new GooglePlayIapError('Google Play subscription verification is not configured.', 503, 'GOOGLE_PLAY_API_NOT_CONFIGURED');
  }
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(GOOGLE_PLAY_PACKAGE_NAME)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  try {
    const response = await client.request({ method: 'GET', url, timeout: 15_000, retry: false });
    return response.data;
  } catch (error) {
    const status = Number(error?.response?.status || error?.code);
    if (status === 404 || status === 410) {
      throw new GooglePlayIapError('Google Play could not find this subscription purchase.', 422, 'GOOGLE_PLAY_PURCHASE_NOT_FOUND');
    }
    throw new GooglePlayIapError('Google Play subscription verification is temporarily unavailable.', 503, 'GOOGLE_PLAY_API_UNAVAILABLE');
  }
}

function matchingProduct(snapshot) {
  return (Array.isArray(snapshot?.lineItems) ? snapshot.lineItems : [])
    .some(item => item?.productId === GOOGLE_PLAY_PRODUCT_ID);
}

function validateSnapshot(snapshot, expectedObfuscatedAccountId) {
  if (!snapshot || !matchingProduct(snapshot)) {
    throw new GooglePlayIapError('The Google Play product is not supported.', 422, 'GOOGLE_PLAY_PRODUCT_MISMATCH');
  }
  const accountId = snapshot.externalAccountIdentifiers?.obfuscatedExternalAccountId
    || snapshot.outOfAppPurchaseContext?.expiredExternalAccountIdentifiers?.obfuscatedExternalAccountId;
  if (!accountId || accountId !== expectedObfuscatedAccountId) {
    throw new GooglePlayIapError('This Google Play purchase is not linked to this Skillomate account.', 403, 'GOOGLE_PLAY_ACCOUNT_MISMATCH');
  }
}

async function executeQuery(query, select = '') {
  if (select && query && typeof query.select === 'function') return query.select(select);
  return query;
}

function createGooglePlayIapService(dependencies = {}) {
  const models = {
    GooglePlaySubscription: dependencies.GooglePlaySubscription || GooglePlaySubscription,
    GooglePlayReconciliation: dependencies.GooglePlayReconciliation || GooglePlayReconciliation,
    User: dependencies.User || User,
  };
  const clientFactory = dependencies.clientFactory || createGooglePlayApiClient;
  const loadSnapshot = dependencies.loadSnapshot || (token => fetchSubscriptionSnapshot(token, clientFactory));
  const acknowledge = dependencies.acknowledgeSubscription || ((token, accountId, resubscribe) => acknowledgeSubscription(token, accountId, resubscribe, clientFactory));
  const syncMirror = dependencies.syncUserSubscriptionMirror || syncUserSubscriptionMirror;
  const now = dependencies.now || (() => Date.now());
  const logger = dependencies.logger || console;

  async function findAccountByUser(userId) {
    return executeQuery(models.GooglePlaySubscription.findOne({ user: userId }), '+purchaseToken');
  }

  async function assertUserAvailable(userId) {
    const user = await executeQuery(models.User.findById(userId), '_id isActive');
    if (!user || user.isActive === false) {
      throw new GooglePlayIapError('This Skillomate account is not available.', 403, 'GOOGLE_PLAY_USER_UNAVAILABLE');
    }
  }

  async function findOwner(token) {
    if (!token) return null;
    const hash = purchaseTokenHash(token);
    const current = await models.GooglePlaySubscription.findOne({ purchaseTokenHash: hash });
    return current?.user ? current : models.GooglePlayReconciliation.findOne({ _id: hash });
  }

  async function assertTokenOwnership(userId, purchaseToken, snapshot) {
    const currentOwner = await findOwner(purchaseToken);
    if (currentOwner?.user && String(currentOwner.user) !== String(userId)) {
      throw new GooglePlayIapError('This Google Play purchase is already linked to another account.', 409, 'GOOGLE_PLAY_PURCHASE_OWNERSHIP');
    }
    const previousToken = snapshot.linkedPurchaseToken || snapshot.outOfAppPurchaseContext?.expiredPurchaseToken;
    if (previousToken) {
      const linkedOwner = await findOwner(previousToken);
      if (linkedOwner?.user && String(linkedOwner.user) !== String(userId)) {
        throw new GooglePlayIapError('The previous Google Play subscription is linked to another account.', 409, 'GOOGLE_PLAY_LINKED_PURCHASE_OWNERSHIP');
      }
    }
    return purchaseTokenHash(purchaseToken);
  }

  async function enqueue(purchaseToken, candidateUser = null) {
    const query = { _id: purchaseTokenHash(purchaseToken),
      ...(candidateUser ? { $or: [{ user: null }, { user: candidateUser }] } : {}) };
    const update = { $set: { purchaseToken, state: 'pending', nextAttemptAt: new Date(now()), updatedAt: new Date(now()),
          ...(candidateUser ? { candidateUser } : {}) },
        $inc: { generation: 1, attempts: 1 }, $setOnInsert: { createdAt: new Date(now()) } };
    try {
      return await models.GooglePlayReconciliation.findOneAndUpdate(query, update, { new: true, upsert: true });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const existing = await models.GooglePlayReconciliation.findOneAndUpdate(query, update, { new: true });
      if (!existing) throw new GooglePlayIapError('Subscription retry work changed. Please retry.', 503, 'GOOGLE_PLAY_QUEUE_CONFLICT');
      return existing;
    }
  }

  async function finishWork(work, state, reason = null, userId = null) {
    const terminal = ['verified', 'blocked'].includes(state);
    const delay = Math.min(6 * 60 * 60 * 1000, 60_000 * 2 ** Math.min(work.attempts || 1, 9));
    const nextState = !terminal && work.attempts >= 24 ? 'blocked' : state;
    // A newer delivery keeps its pending work; an older completion cannot erase it.
    await models.GooglePlayReconciliation.updateOne({ _id: work._id, generation: work.generation }, {
      $set: { state: nextState, reason, nextAttemptAt: terminal || nextState === 'blocked' ? null : new Date(now() + delay),
        updatedAt: new Date(now()), ...(userId ? { user: userId } : {}),
        ...(state === 'verified' ? { attempts: 0 } : {}) },
    });
  }

  async function persistSnapshot(userId, purchaseToken, snapshot, previous) {
    validateSnapshot(snapshot, obfuscatedAccountIdForUser(userId));
    const tokenHash = await assertTokenOwnership(userId, purchaseToken, snapshot);
    await assertUserAvailable(userId);
    const entitlement = deriveGooglePlayEntitlement(snapshot, now());
    const prior = previous === undefined ? await findAccountByUser(userId) : previous;
    if (prior?.purchaseTokenHash && prior.purchaseTokenHash !== tokenHash) {
      const linked = snapshot.linkedPurchaseToken || snapshot.outOfAppPurchaseContext?.expiredPurchaseToken;
      const startsAfterPreviousPeriod = new Date(snapshot.startTime || 0).getTime() >= new Date(prior.expiresAt || Infinity).getTime();
      if ((!linked || purchaseTokenHash(linked) !== prior.purchaseTokenHash) && !startsAfterPreviousPeriod) {
        throw new GooglePlayIapError('A newer Google Play purchase is already recorded. Refresh subscription status.', 409, 'GOOGLE_PLAY_SUPERSEDED_TOKEN');
      }
      // A pending replacement never removes an existing paid entitlement.
      if (!entitlement.entitlementActive && publicGooglePlayEntitlement(prior, new Date(now())).entitlementActive) {
        throw new GooglePlayIapError('Google Play replacement payment is not active yet.', 409, 'GOOGLE_PLAY_REPLACEMENT_PENDING');
      }
      // Preserve ownership of the retired token; older RTDNs must not replace its successor.
      await models.GooglePlayReconciliation.findOneAndUpdate({ _id: prior.purchaseTokenHash }, {
        $set: { user: userId },
        $setOnInsert: { purchaseToken: prior.purchaseToken, state: 'verified', createdAt: new Date(now()), updatedAt: new Date(now()) },
      }, { new: true, upsert: true });
    }
    const update = {
      purchaseToken, purchaseTokenHash: tokenHash, productId: entitlement.productId,
      packageName: GOOGLE_PLAY_PACKAGE_NAME, basePlanId: entitlement.basePlanId, offerId: entitlement.offerId,
      latestOrderId: entitlement.latestOrderId, subscriptionState: entitlement.subscriptionState,
      acknowledgementState: prior?.purchaseTokenHash === tokenHash && prior.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'
        ? prior.acknowledgementState : entitlement.acknowledgementState,
      entitlementState: entitlement.entitlementState, entitlementActive: entitlement.entitlementActive,
      expiresAt: entitlement.expiresAt, autoRenewEnabled: entitlement.autoRenewEnabled,
      lastVerifiedAt: new Date(now()), updatedAt: new Date(now()),
      verificationVersion: (prior?.verificationVersion || 0) + 1,
    };
    const filter = { user: userId };
    if (prior) {
      filter.purchaseTokenHash = prior.purchaseTokenHash;
      filter.$or = [{ verificationVersion: prior.verificationVersion || 0 },
        ...(!prior.verificationVersion ? [{ verificationVersion: { $exists: false } }] : [])];
    } else {
      filter.purchaseTokenHash = { $exists: false };
    }
    let saved;
    try {
      saved = await models.GooglePlaySubscription.findOneAndUpdate(filter,
        { $set: update, $setOnInsert: { createdAt: new Date(now()) } }, { new: true, upsert: !prior });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      await assertTokenOwnership(userId, purchaseToken, snapshot);
      throw new GooglePlayIapError('Subscription changed during verification.', 503, 'GOOGLE_PLAY_SNAPSHOT_CONFLICT');
    }
    if (!saved) throw new GooglePlayIapError('Subscription changed during verification.', 503, 'GOOGLE_PLAY_SNAPSHOT_CONFLICT');
    await models.GooglePlayReconciliation.updateOne({ _id: tokenHash }, { $set: { user: userId, candidateUser: null } });
    await syncMirror(userId, { User: models.User, GooglePlaySubscription: models.GooglePlaySubscription, now: new Date(now()) });
    return saved;
  }

  async function acknowledgeVerified(userId, purchaseToken, snapshot, subscription) {
    if (!publicGooglePlayEntitlement(subscription, new Date(now())).entitlementActive
      || subscription.acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_PENDING') return false;
    await assertUserAvailable(userId);
    const hash = purchaseTokenHash(purchaseToken);
    const leaseOwner = crypto.randomUUID();
    const claimed = await models.GooglePlaySubscription.updateOne({ user: userId, purchaseTokenHash: hash,
      acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
      $or: [{ acknowledgementLeaseUntil: null }, { acknowledgementLeaseUntil: { $lte: new Date(now()) } }],
    }, { $set: { acknowledgementLeaseOwner: leaseOwner, acknowledgementLeaseUntil: new Date(now() + 60_000) } });
    if (!claimed.modifiedCount) return true;
    try {
      const acknowledgementSnapshot = await acknowledge(purchaseToken, obfuscatedAccountIdForUser(userId), Boolean(snapshot.outOfAppPurchaseContext));
      if (acknowledgementSnapshot) {
        // An ambiguous ACK response may reveal a newer revoked state. Apply it
        // against the original revision, or retry if another writer got there first.
        await persistSnapshot(userId, purchaseToken, acknowledgementSnapshot, subscription);
      }
      await models.GooglePlaySubscription.updateOne({ user: userId, purchaseTokenHash: hash, acknowledgementLeaseOwner: leaseOwner }, {
        $set: { acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED', acknowledgementLeaseUntil: null, acknowledgementLeaseOwner: null },
        $inc: { verificationVersion: 1 },
      });
      subscription.acknowledgementState = 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';
      return false;
    } catch (error) {
      await models.GooglePlaySubscription.updateOne({ user: userId, purchaseTokenHash: hash, acknowledgementLeaseOwner: leaseOwner }, {
        $set: { acknowledgementLeaseUntil: null, acknowledgementLeaseOwner: null },
      });
      logger.warn(`Google Play acknowledgement queued (${error?.code || 'GOOGLE_PLAY_ACKNOWLEDGEMENT_PENDING'})`);
      return true;
    }
  }

  async function refreshOwnedPurchase(userId, purchaseToken, work) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const previous = await findAccountByUser(userId);
      const snapshot = await loadSnapshot(purchaseToken);
      try {
        const saved = await persistSnapshot(userId, purchaseToken, snapshot, previous);
        const acknowledgementPending = await acknowledgeVerified(userId, purchaseToken, snapshot, saved);
        await finishWork(work, acknowledgementPending ? 'pending' : 'verified',
          acknowledgementPending ? 'GOOGLE_PLAY_ACKNOWLEDGEMENT_PENDING' : null, userId);
        // A concurrent RTDN may have revoked/replaced this purchase while acknowledgement ran.
        return publicGooglePlayEntitlement(await findAccountByUser(userId), new Date(now()));
      } catch (error) {
        if (error.code === 'GOOGLE_PLAY_SNAPSHOT_CONFLICT' && attempt < 2) continue;
        throw error;
      }
    }
  }

  async function recordFailure(work, error) {
    if (['GOOGLE_PLAY_ACCOUNT_MISMATCH', 'GOOGLE_PLAY_PURCHASE_OWNERSHIP', 'GOOGLE_PLAY_LINKED_PURCHASE_OWNERSHIP'].includes(error.code)) {
      // An invalid submitter cannot block a concurrently verified owner's retry work.
      const current = await models.GooglePlayReconciliation.findOne({ _id: work._id });
      if (current?.user) return;
      await finishWork(work, 'unresolved', error.code);
      return;
    }
    const retry = Number(error.statusCode || 500) >= 500 || error.code === 'GOOGLE_PLAY_REPLACEMENT_PENDING';
    await finishWork(work, retry ? 'pending' : 'blocked', error.code || 'GOOGLE_PLAY_PROCESSING_FAILED');
  }

  async function verifyClientPurchase(userId, purchaseToken) {
    if (typeof purchaseToken !== 'string' || purchaseToken.length < 20 || purchaseToken.length > 4096) {
      throw new GooglePlayIapError('A valid Google Play purchase token is required.', 400, 'GOOGLE_PLAY_TOKEN_REQUIRED');
    }
    const owner = await findOwner(purchaseToken);
    if (owner?.user && String(owner.user) !== String(userId)) {
      throw new GooglePlayIapError('This Google Play purchase is already linked to another account.', 409, 'GOOGLE_PLAY_PURCHASE_OWNERSHIP');
    }
    const work = await enqueue(purchaseToken, userId);
    try { return await refreshOwnedPurchase(userId, purchaseToken, work); }
    catch (error) { await recordFailure(work, error); throw error; }
  }

  async function processDeveloperNotification(purchaseToken) {
    if (typeof purchaseToken !== 'string' || purchaseToken.length < 20 || purchaseToken.length > 4096) {
      throw new GooglePlayIapError('A valid Google Play notification token is required.', 400, 'GOOGLE_PLAY_NOTIFICATION_TOKEN_INVALID');
    }
    const work = await enqueue(purchaseToken);
    try {
      // Notification labels (including voided/refund) never determine entitlement.
      const snapshot = await loadSnapshot(purchaseToken);
      if (!matchingProduct(snapshot)) throw new GooglePlayIapError('The Google Play product is not supported.', 422, 'GOOGLE_PLAY_PRODUCT_MISMATCH');
      const account = await findOwner(purchaseToken)
        || await findOwner(snapshot.linkedPurchaseToken || snapshot.outOfAppPurchaseContext?.expiredPurchaseToken);
      let owner = account?.user;
      if (!owner) {
        const linked = await findOwner(snapshot.linkedPurchaseToken || snapshot.outOfAppPurchaseContext?.expiredPurchaseToken);
        owner = linked?.user;
      }
      // Recover an interrupted first verification, but never treat the submitter as
      // established ownership: validateSnapshot below must confirm its Google binding.
      if (!owner) owner = work.candidateUser;
      if (!owner) {
        await finishWork(work, 'unresolved', 'GOOGLE_PLAY_OWNER_UNRESOLVED');
        logger.warn(`Google Play notification awaiting account reconciliation (tokenHash=${work._id})`);
        return { processed: false, reconciliationPending: true };
      }
      validateSnapshot(snapshot, obfuscatedAccountIdForUser(owner));
      const current = await findAccountByUser(owner);
      if (current?.purchaseTokenHash !== purchaseTokenHash(purchaseToken)) {
        // Replayed retired tokens refresh the current purchase instead of replacing it.
        const linked = snapshot.linkedPurchaseToken || snapshot.outOfAppPurchaseContext?.expiredPurchaseToken;
        const isReplacement = linked && purchaseTokenHash(linked) === current?.purchaseTokenHash;
        const startsLater = new Date(snapshot.startTime || 0).getTime() >= new Date(current?.expiresAt || Infinity).getTime();
        if (current?.purchaseToken && !isReplacement && !startsLater) {
          const entitlement = await verifyClientPurchase(owner, current.purchaseToken);
          await finishWork(work, 'verified', 'GOOGLE_PLAY_SUPERSEDED_TOKEN', owner);
          return { processed: true, entitlement };
        }
      }
      const entitlement = await refreshOwnedPurchase(owner, purchaseToken, work);
      return { processed: true, entitlement };
    } catch (error) { await recordFailure(work, error); throw error; }
  }

  async function statusForUser(userId) {
    let account = await findAccountByUser(userId);
    let refreshStatus = account ? 'temporarily_unavailable' : 'not_purchased';
    if (account?.purchaseToken) {
      try {
        const entitlement = await verifyClientPurchase(userId, account.purchaseToken);
        return { ...entitlement, obfuscatedAccountId: obfuscatedAccountIdForUser(userId), refreshStatus: 'verified' };
      } catch (error) {
        logger.error(`Google Play subscription status refresh failed (${error?.code || error?.name || 'unknown'})`);
        account = await findAccountByUser(userId);
      }
    }
    return { ...publicGooglePlayEntitlement(account, new Date(now())), obfuscatedAccountId: obfuscatedAccountIdForUser(userId), refreshStatus };
  }

  async function reconcileDuePurchases({ limit = 50 } = {}) {
    const batchSize = Math.max(1, Math.min(Number(limit) || 50, 100));
    const deadline = now() + 2 * 60_000;
    const due = await models.GooglePlayReconciliation.find({ state: { $in: ['pending', 'unresolved'] }, nextAttemptAt: { $lte: new Date(now()) } })
      .sort({ nextAttemptAt: 1 }).limit(batchSize).select('+purchaseToken');
    const stale = await models.GooglePlaySubscription.find({
      $and: [{ $or: [{ lastVerifiedAt: null }, { lastVerifiedAt: { $lte: new Date(now() - 15 * 60_000) } }] },
        { $or: [{ lastReconciliationAttemptAt: null }, { lastReconciliationAttemptAt: { $lte: new Date(now() - 15 * 60_000) } }] },
        { $or: [{ expiresAt: { $gte: new Date(now() - 60 * 24 * 60 * 60_000) } },
          { subscriptionState: { $in: ['SUBSCRIPTION_STATE_PENDING', 'SUBSCRIPTION_STATE_ON_HOLD', 'SUBSCRIPTION_STATE_PAUSED'] } }] }],
    }).sort({ lastReconciliationAttemptAt: 1 }).limit(batchSize).select('+purchaseToken');
    const tokens = new Set([...due, ...stale].map(item => item.purchaseToken).filter(Boolean));
    let processed = 0;
    let checked = 0;
    for (const token of tokens) {
      if (now() >= deadline) break;
      checked += 1;
      await models.GooglePlaySubscription.updateOne({ purchaseTokenHash: purchaseTokenHash(token) }, {
        $set: { lastReconciliationAttemptAt: new Date(now()) },
      });
      try { if ((await processDeveloperNotification(token)).processed) processed += 1; }
      catch (error) { logger.warn(`Google Play reconciliation deferred (${error?.code || 'GOOGLE_PLAY_PROCESSING_FAILED'})`); }
    }
    return { checked, processed };
  }

  return { persistSnapshot, processDeveloperNotification, reconcileDuePurchases, statusForUser, verifyClientPurchase };
}

module.exports = {
  GooglePlayIapError,
  acknowledgeSubscription,
  createGooglePlayApiClient,
  createGooglePlayIapService,
  fetchSubscriptionSnapshot,
  obfuscatedAccountIdForUser,
  purchaseTokenHash,
  serviceAccountCredentials,
  validateSnapshot,
};
