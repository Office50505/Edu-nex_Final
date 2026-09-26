const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
} = require('@apple/app-store-server-library');
const AppleSubscription = require('../models/AppleSubscription');
const AppleTransaction = require('../models/AppleTransaction');
const AppleNotification = require('../models/AppleNotification');
const User = require('../models/User');
const {
  APPLE_PRODUCT_ID,
  deriveAppleEntitlement,
  publicAppleEntitlement,
} = require('./appleEntitlement');

const APPLE_BUNDLE_ID = process.env.APPLE_BUNDLE_ID || 'com.alihussainkhan.edunexfinal';

class AppleIapError extends Error {
  constructor(message, statusCode = 400, code = 'APPLE_IAP_ERROR') {
    super(message);
    this.name = 'AppleIapError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function rootCertificateBuffers() {
  const configured = String(process.env.APPLE_ROOT_CA_PATHS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const directory = path.join(__dirname, '..', 'config', 'apple-root-certificates');
  const bundled = fs.existsSync(directory)
    ? fs.readdirSync(directory)
      .filter(name => /\.(?:cer|pem)$/i.test(name))
      .map(name => path.join(directory, name))
    : [];
  const paths = [...new Set([...configured, ...bundled])];
  if (!paths.length) {
    throw new AppleIapError('Apple transaction verification is not configured.', 503, 'APPLE_VERIFIER_NOT_CONFIGURED');
  }
  return paths.map(file => fs.readFileSync(file));
}

let verifierCache;
function defaultVerifiers() {
  if (verifierCache) return verifierCache;
  const certificates = rootCertificateBuffers();
  const appAppleId = process.env.APPLE_APP_ID ? Number(process.env.APPLE_APP_ID) : undefined;
  verifierCache = [
    {
      environment: Environment.PRODUCTION,
      verifier: new SignedDataVerifier(certificates, true, Environment.PRODUCTION, APPLE_BUNDLE_ID, appAppleId),
    },
    {
      environment: Environment.SANDBOX,
      verifier: new SignedDataVerifier(certificates, true, Environment.SANDBOX, APPLE_BUNDLE_ID),
    },
  ];
  return verifierCache;
}

async function verifyWithAvailableEnvironment(method, signedPayload, verifiers = defaultVerifiers()) {
  let lastError;
  for (const entry of verifiers) {
    try {
      return { decoded: await entry.verifier[method](signedPayload), environment: entry.environment, verifier: entry.verifier };
    } catch (error) {
      lastError = error;
    }
  }
  throw new AppleIapError('The App Store transaction could not be verified.', 422, 'APPLE_VERIFICATION_FAILED');
}

function validateSignedTransaction(transaction, expectedToken) {
  if (transaction.bundleId !== APPLE_BUNDLE_ID) {
    throw new AppleIapError('The App Store transaction is for a different app.', 422, 'APPLE_BUNDLE_MISMATCH');
  }
  if (transaction.productId !== APPLE_PRODUCT_ID) {
    throw new AppleIapError('The App Store product is not supported.', 422, 'APPLE_PRODUCT_MISMATCH');
  }
  if (!transaction.transactionId || !transaction.originalTransactionId) {
    throw new AppleIapError('The App Store transaction is incomplete.', 422, 'APPLE_TRANSACTION_INCOMPLETE');
  }
  if (!expectedToken || String(transaction.appAccountToken || '').toLowerCase() !== String(expectedToken).toLowerCase()) {
    throw new AppleIapError('The App Store transaction is not linked to this account.', 403, 'APPLE_ACCOUNT_MISMATCH');
  }
}

function userSubscriptionFields(entitlement) {
  return entitlement.entitlementActive
    ? { subscriptionStatus: 'active', subscriptionExpiry: entitlement.gracePeriodExpiresAt || entitlement.expiresAt, isOnTrial: false }
    : { subscriptionStatus: 'expired', subscriptionExpiry: entitlement.expiresAt || null, isOnTrial: false };
}

function createAppleIapService(dependencies = {}) {
  const models = {
    AppleSubscription: dependencies.AppleSubscription || AppleSubscription,
    AppleTransaction: dependencies.AppleTransaction || AppleTransaction,
    AppleNotification: dependencies.AppleNotification || AppleNotification,
    User: dependencies.User || User,
  };
  const verifyPayload = dependencies.verifyPayload || verifyWithAvailableEnvironment;
  const serverApiClientFactory = dependencies.serverApiClientFactory || createServerApiClient;
  const now = dependencies.now || (() => Date.now());

  async function ensureAccount(userId) {
    let subscription = await models.AppleSubscription.findOne({ user: userId });
    if (subscription) return subscription;
    try {
      subscription = await models.AppleSubscription.create({
        user: userId,
        appAccountToken: crypto.randomUUID().toLowerCase(),
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      subscription = await models.AppleSubscription.findOne({ user: userId });
    }
    return subscription;
  }

  async function persistVerifiedTransaction({ userId, account, transaction, renewal = {}, notificationType = '', subtype = '', storeStatus = null }) {
    validateSignedTransaction(transaction, account.appAccountToken);
    const existing = await models.AppleTransaction.findOne({ transactionId: transaction.transactionId });
    if (existing && String(existing.user) !== String(userId)) {
      throw new AppleIapError('This transaction is already linked to another account.', 409, 'APPLE_TRANSACTION_OWNERSHIP');
    }

    const entitlement = deriveAppleEntitlement({ transaction, renewal, notificationType, subtype, storeStatus, now: now() });
    if (!existing) {
      try {
        await models.AppleTransaction.create({
          user: userId,
          transactionId: transaction.transactionId,
          originalTransactionId: transaction.originalTransactionId,
          productId: transaction.productId,
          environment: transaction.environment || null,
          purchaseDate: transaction.purchaseDate ? new Date(transaction.purchaseDate) : null,
          expiresAt: entitlement.expiresAt,
          revocationDate: entitlement.revokedAt,
          transactionReason: transaction.transactionReason || null,
        });
      } catch (error) {
        if (error?.code !== 11000) throw error;
        const raced = await models.AppleTransaction.findOne({ transactionId: transaction.transactionId });
        if (raced && String(raced.user) !== String(userId)) {
          throw new AppleIapError('This transaction is already linked to another account.', 409, 'APPLE_TRANSACTION_OWNERSHIP');
        }
      }
    }

    const update = {
      productId: transaction.productId,
      originalTransactionId: transaction.originalTransactionId,
      latestTransactionId: transaction.transactionId,
      environment: transaction.environment || account.environment || null,
      purchasedAt: transaction.purchaseDate ? new Date(transaction.purchaseDate) : account.purchasedAt,
      ...entitlement,
      lastVerifiedAt: new Date(now()),
      lastNotificationType: notificationType || account.lastNotificationType || null,
      lastNotificationSubtype: subtype || account.lastNotificationSubtype || null,
      updatedAt: new Date(now()),
    };
    delete update.revokedAt;
    update.revokedAt = entitlement.revokedAt;
    const saved = await models.AppleSubscription.findOneAndUpdate(
      { user: userId, appAccountToken: account.appAccountToken },
      { $set: update },
      { new: true }
    );
    await models.User.updateOne({ _id: userId }, { $set: userSubscriptionFields(entitlement) });
    return { subscription: saved, entitlement, duplicate: Boolean(existing) };
  }

  async function verifyClientTransaction(userId, signedTransaction) {
    if (typeof signedTransaction !== 'string' || signedTransaction.length < 100 || signedTransaction.length > 100000) {
      throw new AppleIapError('A valid signed App Store transaction is required.', 400, 'APPLE_TRANSACTION_REQUIRED');
    }
    const account = await ensureAccount(userId);
    const { decoded: transaction } = await verifyPayload('verifyAndDecodeTransaction', signedTransaction);
    validateSignedTransaction(transaction, account.appAccountToken);
    const existing = await models.AppleTransaction.findOne({ transactionId: transaction.transactionId });
    if (existing && String(existing.user) !== String(userId)) {
      throw new AppleIapError('This transaction is already linked to another account.', 409, 'APPLE_TRANSACTION_OWNERSHIP');
    }
    // A client can retain an older, still correctly signed JWS. Never let replay of
    // that device payload overwrite a refund/revocation or newer server state.
    // Server notifications and App Store Server API refreshes remain authoritative.
    if (existing || ['REFUNDED', 'REVOKED'].includes(account.entitlementState)) {
      return { ...publicAppleEntitlement(account, new Date(now())), duplicate: true };
    }
    const result = await persistVerifiedTransaction({ userId, account, transaction });
    return { ...publicAppleEntitlement(result.subscription, new Date(now())), duplicate: result.duplicate };
  }

  async function refreshSubscriptionFromApple(userId, account) {
    if (!account?.originalTransactionId) return { account, refreshStatus: 'not_purchased' };
    const environment = account.environment === Environment.SANDBOX || account.environment === 'Sandbox'
      ? Environment.SANDBOX
      : Environment.PRODUCTION;
    const client = serverApiClientFactory(environment);
    if (!client) return { account, refreshStatus: 'not_configured' };

    const response = await client.getAllSubscriptionStatuses(account.originalTransactionId);
    const candidates = (response?.data || [])
      .flatMap(group => group?.lastTransactions || [])
      .filter(item => item?.signedTransactionInfo);
    let selected = null;
    for (const item of candidates) {
      const { decoded: transaction } = await verifyPayload('verifyAndDecodeTransaction', item.signedTransactionInfo);
      if (transaction.productId !== APPLE_PRODUCT_ID
        || transaction.originalTransactionId !== account.originalTransactionId) continue;
      let renewal = {};
      if (item.signedRenewalInfo) {
        ({ decoded: renewal } = await verifyPayload('verifyAndDecodeRenewalInfo', item.signedRenewalInfo));
      }
      validateSignedTransaction(transaction, account.appAccountToken);
      const expiry = Number(transaction.expiresDate || 0);
      if (!selected || expiry > selected.expiry) {
        selected = { item, transaction, renewal, expiry };
      }
    }
    if (!selected) {
      throw new AppleIapError('Apple returned no matching subscription status.', 502, 'APPLE_STATUS_MISMATCH');
    }

    const persisted = await persistVerifiedTransaction({
      userId,
      account,
      transaction: selected.transaction,
      renewal: selected.renewal,
      storeStatus: selected.item.status,
    });
    return { account: persisted.subscription, refreshStatus: 'verified' };
  }

  async function statusForUser(userId) {
    let account = await ensureAccount(userId);
    let refreshStatus = 'not_purchased';
    try {
      const refreshed = await refreshSubscriptionFromApple(userId, account);
      account = refreshed.account;
      refreshStatus = refreshed.refreshStatus;
    } catch (error) {
      refreshStatus = 'temporarily_unavailable';
      console.error(`Apple subscription status refresh failed (${error?.code || error?.name || 'unknown'})`);
    }
    return {
      ...publicAppleEntitlement(account, new Date(now())),
      appAccountToken: account.appAccountToken,
      refreshStatus,
    };
  }

  async function processNotification(signedPayload) {
    if (typeof signedPayload !== 'string' || signedPayload.length < 100 || signedPayload.length > 200000) {
      throw new AppleIapError('A valid signed notification is required.', 400, 'APPLE_NOTIFICATION_REQUIRED');
    }
    const { decoded: notification, verifier } = await verifyPayload('verifyAndDecodeNotification', signedPayload);
    if (!notification.notificationUUID) {
      throw new AppleIapError('The App Store notification is incomplete.', 422, 'APPLE_NOTIFICATION_INCOMPLETE');
    }
    const existing = await models.AppleNotification.findOne({ notificationUUID: notification.notificationUUID });
    if (existing) return { duplicate: true, processed: existing.processed };

    let transaction = null;
    let renewal = {};
    if (notification.data?.signedTransactionInfo) {
      transaction = await verifier.verifyAndDecodeTransaction(notification.data.signedTransactionInfo);
    }
    if (notification.data?.signedRenewalInfo) {
      renewal = await verifier.verifyAndDecodeRenewalInfo(notification.data.signedRenewalInfo);
    }
    const originalTransactionId = transaction?.originalTransactionId || renewal?.originalTransactionId || null;
    const account = originalTransactionId
      ? await models.AppleSubscription.findOne({ originalTransactionId })
      : transaction?.appAccountToken
        ? await models.AppleSubscription.findOne({ appAccountToken: String(transaction.appAccountToken).toLowerCase() })
        : null;

    let processed = false;
    let processingNote = 'No matching account';
    if (account && transaction) {
      await persistVerifiedTransaction({
        userId: account.user,
        account,
        transaction,
        renewal,
        notificationType: notification.notificationType,
        subtype: notification.subtype,
      });
      processed = true;
      processingNote = 'Entitlement synchronized';
    }

    try {
      await models.AppleNotification.create({
        notificationUUID: notification.notificationUUID,
        notificationType: notification.notificationType || null,
        subtype: notification.subtype || null,
        signedDate: notification.signedDate ? new Date(notification.signedDate) : null,
        environment: notification.data?.environment || null,
        originalTransactionId,
        processed,
        processingNote,
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      return { duplicate: true, processed };
    }
    return { duplicate: false, processed };
  }

  return { ensureAccount, processNotification, refreshSubscriptionFromApple, statusForUser, verifyClientTransaction };
}

function createServerApiClient(environment) {
  const signingKey = String(process.env.APPLE_IAP_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const keyId = process.env.APPLE_IAP_KEY_ID;
  const issuerId = process.env.APPLE_IAP_ISSUER_ID;
  if (!signingKey || !keyId || !issuerId) return null;
  return new AppStoreServerAPIClient(signingKey, keyId, issuerId, APPLE_BUNDLE_ID, environment);
}

module.exports = {
  APPLE_BUNDLE_ID,
  AppleIapError,
  createAppleIapService,
  createServerApiClient,
  rootCertificateBuffers,
  validateSignedTransaction,
  verifyWithAvailableEnvironment,
};
