const crypto = require('node:crypto');
const { GoogleAuth } = require('google-auth-library');
const GooglePlaySubscription = require('../models/GooglePlaySubscription');
const User = require('../models/User');
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
  clientPromise = new GoogleAuth({ credentials, scopes: [ANDROID_PUBLISHER_SCOPE] }).getClient();
  return clientPromise;
}

async function fetchSubscriptionSnapshot(purchaseToken, clientFactory = createGooglePlayApiClient) {
  const client = await clientFactory();
  if (!client) {
    throw new GooglePlayIapError('Google Play subscription verification is not configured.', 503, 'GOOGLE_PLAY_API_NOT_CONFIGURED');
  }
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(GOOGLE_PLAY_PACKAGE_NAME)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  try {
    const response = await client.request({ method: 'GET', url });
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
  const accountId = snapshot.externalAccountIdentifiers?.obfuscatedExternalAccountId;
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
    User: dependencies.User || User,
  };
  const loadSnapshot = dependencies.loadSnapshot || (token => fetchSubscriptionSnapshot(token, dependencies.clientFactory || createGooglePlayApiClient));
  const now = dependencies.now || (() => Date.now());

  async function findAccountByUser(userId) {
    return executeQuery(models.GooglePlaySubscription.findOne({ user: userId }), '+purchaseToken');
  }

  async function assertTokenOwnership(userId, purchaseToken, snapshot) {
    const currentHash = purchaseTokenHash(purchaseToken);
    const currentOwner = await models.GooglePlaySubscription.findOne({ purchaseTokenHash: currentHash });
    if (currentOwner && String(currentOwner.user) !== String(userId)) {
      throw new GooglePlayIapError('This Google Play purchase is already linked to another account.', 409, 'GOOGLE_PLAY_PURCHASE_OWNERSHIP');
    }
    if (snapshot?.linkedPurchaseToken) {
      const linkedOwner = await models.GooglePlaySubscription.findOne({ purchaseTokenHash: purchaseTokenHash(snapshot.linkedPurchaseToken) });
      if (linkedOwner && String(linkedOwner.user) !== String(userId)) {
        throw new GooglePlayIapError('The previous Google Play subscription is linked to another account.', 409, 'GOOGLE_PLAY_LINKED_PURCHASE_OWNERSHIP');
      }
    }
    return currentHash;
  }

  async function persistSnapshot(userId, purchaseToken, snapshot) {
    const expectedAccountId = obfuscatedAccountIdForUser(userId);
    validateSnapshot(snapshot, expectedAccountId);
    const tokenHash = await assertTokenOwnership(userId, purchaseToken, snapshot);
    const entitlement = deriveGooglePlayEntitlement(snapshot, now());
    const update = {
      purchaseToken,
      purchaseTokenHash: tokenHash,
      productId: entitlement.productId,
      packageName: GOOGLE_PLAY_PACKAGE_NAME,
      basePlanId: entitlement.basePlanId,
      offerId: entitlement.offerId,
      latestOrderId: entitlement.latestOrderId,
      subscriptionState: entitlement.subscriptionState,
      acknowledgementState: entitlement.acknowledgementState,
      entitlementState: entitlement.entitlementState,
      entitlementActive: entitlement.entitlementActive,
      expiresAt: entitlement.expiresAt,
      autoRenewEnabled: entitlement.autoRenewEnabled,
      lastVerifiedAt: new Date(now()),
      updatedAt: new Date(now()),
    };
    let saved;
    try {
      saved = await models.GooglePlaySubscription.findOneAndUpdate(
        { user: userId },
        { $set: update, $setOnInsert: { createdAt: new Date(now()) } },
        { new: true, upsert: true }
      );
    } catch (error) {
      if (error?.code !== 11000) throw error;
      throw new GooglePlayIapError('This Google Play purchase is already linked to another account.', 409, 'GOOGLE_PLAY_PURCHASE_OWNERSHIP');
    }
    await models.User.updateOne({ _id: userId }, {
      $set: entitlement.entitlementActive
        ? { subscriptionStatus: 'active', subscriptionExpiry: entitlement.expiresAt, isOnTrial: false }
        : { subscriptionStatus: 'expired', subscriptionExpiry: entitlement.expiresAt || null, isOnTrial: false },
    });
    return { subscription: saved, entitlement };
  }

  async function verifyClientPurchase(userId, purchaseToken) {
    if (typeof purchaseToken !== 'string' || purchaseToken.length < 20 || purchaseToken.length > 4096) {
      throw new GooglePlayIapError('A valid Google Play purchase token is required.', 400, 'GOOGLE_PLAY_TOKEN_REQUIRED');
    }
    const snapshot = await loadSnapshot(purchaseToken);
    const persisted = await persistSnapshot(userId, purchaseToken, snapshot);
    return publicGooglePlayEntitlement(persisted.subscription, new Date(now()));
  }

  async function processDeveloperNotification(purchaseToken) {
    if (typeof purchaseToken !== 'string' || purchaseToken.length < 20 || purchaseToken.length > 4096) {
      throw new GooglePlayIapError('A valid Google Play notification token is required.', 400, 'GOOGLE_PLAY_NOTIFICATION_TOKEN_INVALID');
    }
    const snapshot = await loadSnapshot(purchaseToken);
    let account = await executeQuery(
      models.GooglePlaySubscription.findOne({ purchaseTokenHash: purchaseTokenHash(purchaseToken) }),
      '+purchaseToken'
    );
    if (!account && snapshot?.linkedPurchaseToken) {
      account = await executeQuery(
        models.GooglePlaySubscription.findOne({ purchaseTokenHash: purchaseTokenHash(snapshot.linkedPurchaseToken) }),
        '+purchaseToken'
      );
    }
    if (!account?.user) return { processed: false };
    const persisted = await persistSnapshot(account.user, purchaseToken, snapshot);
    return {
      processed: true,
      entitlement: publicGooglePlayEntitlement(persisted.subscription, new Date(now())),
    };
  }

  async function statusForUser(userId) {
    let account = await findAccountByUser(userId);
    let refreshStatus = account ? 'temporarily_unavailable' : 'not_purchased';
    if (account?.purchaseToken) {
      try {
        const snapshot = await loadSnapshot(account.purchaseToken);
        account = (await persistSnapshot(userId, account.purchaseToken, snapshot)).subscription;
        refreshStatus = 'verified';
      } catch (error) {
        console.error(`Google Play subscription status refresh failed (${error?.code || error?.name || 'unknown'})`);
      }
    }
    return {
      ...publicGooglePlayEntitlement(account, new Date(now())),
      obfuscatedAccountId: obfuscatedAccountIdForUser(userId),
      refreshStatus,
    };
  }

  return { persistSnapshot, processDeveloperNotification, statusForUser, verifyClientPurchase };
}

module.exports = {
  GooglePlayIapError,
  createGooglePlayApiClient,
  createGooglePlayIapService,
  fetchSubscriptionSnapshot,
  obfuscatedAccountIdForUser,
  purchaseTokenHash,
  serviceAccountCredentials,
  validateSnapshot,
};
