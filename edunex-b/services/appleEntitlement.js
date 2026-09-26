const APPLE_PRODUCT_ID = process.env.APPLE_SUBSCRIPTION_PRODUCT_ID || 'com.skillomate.premium.monthly';

const STATES = Object.freeze({
  ACTIVE: 'ACTIVE',
  ACTIVE_CANCELS_AT_PERIOD_END: 'ACTIVE_CANCELS_AT_PERIOD_END',
  GRACE_PERIOD: 'GRACE_PERIOD',
  BILLING_RETRY: 'BILLING_RETRY',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
  REFUNDED: 'REFUNDED',
  NONE: 'NONE',
  UNKNOWN: 'UNKNOWN',
});

const ACTIVE_STATES = new Set([
  STATES.ACTIVE,
  STATES.ACTIVE_CANCELS_AT_PERIOD_END,
  STATES.GRACE_PERIOD,
]);

function asDate(milliseconds) {
  const value = Number(milliseconds);
  return Number.isFinite(value) && value > 0 ? new Date(value) : null;
}

function deriveAppleEntitlement({ transaction = {}, renewal = {}, notificationType = '', subtype = '', storeStatus = null, now = Date.now() } = {}) {
  const expiresAt = asDate(transaction.expiresDate);
  const gracePeriodExpiresAt = asDate(renewal.gracePeriodExpiresDate);
  const revokedAt = asDate(transaction.revocationDate);
  const autoRenewEnabled = renewal.autoRenewStatus === undefined ? null : Number(renewal.autoRenewStatus) === 1;
  const notification = String(notificationType || '').toUpperCase();
  const detail = String(subtype || '').toUpperCase();
  const status = Number(storeStatus);
  let state = STATES.UNKNOWN;

  if (revokedAt || notification === 'REVOKE') state = STATES.REVOKED;
  else if (notification === 'REFUND' || notification === 'REFUND_REVERSED') {
    state = notification === 'REFUND' ? STATES.REFUNDED : (expiresAt?.getTime() > now ? STATES.ACTIVE : STATES.EXPIRED);
  } else if (status === 5) state = STATES.REVOKED;
  else if (status === 4 || gracePeriodExpiresAt?.getTime() > now || detail === 'GRACE_PERIOD') state = STATES.GRACE_PERIOD;
  else if (status === 3 || renewal.isInBillingRetryPeriod === true || notification === 'DID_FAIL_TO_RENEW') state = STATES.BILLING_RETRY;
  else if (status === 2 || !expiresAt || expiresAt.getTime() <= now || notification === 'EXPIRED') state = STATES.EXPIRED;
  else if (autoRenewEnabled === false || notification === 'DID_CHANGE_RENEWAL_STATUS' && detail === 'AUTO_RENEW_DISABLED') {
    state = STATES.ACTIVE_CANCELS_AT_PERIOD_END;
  } else if (status === 1 || expiresAt?.getTime() > now) state = STATES.ACTIVE;

  const activeUntil = state === STATES.GRACE_PERIOD ? gracePeriodExpiresAt : expiresAt;
  const entitlementActive = ACTIVE_STATES.has(state) && Boolean(activeUntil && activeUntil.getTime() > now);
  return {
    entitlementState: state,
    entitlementActive,
    expiresAt,
    gracePeriodExpiresAt,
    revokedAt,
    autoRenewEnabled,
    billingRetry: state === STATES.BILLING_RETRY,
  };
}

function publicAppleEntitlement(subscription, serverNow = new Date()) {
  if (!subscription) {
    return { entitlementState: STATES.NONE, entitlementActive: false, expiresAt: null, serverNow };
  }
  const active = ACTIVE_STATES.has(subscription.entitlementState)
    && new Date(subscription.entitlementState === STATES.GRACE_PERIOD
      ? subscription.gracePeriodExpiresAt
      : subscription.expiresAt).getTime() > serverNow.getTime();
  return {
    entitlementState: subscription.entitlementState || STATES.UNKNOWN,
    entitlementActive: active,
    expiresAt: subscription.expiresAt || null,
    gracePeriodExpiresAt: subscription.gracePeriodExpiresAt || null,
    autoRenewEnabled: subscription.autoRenewEnabled ?? null,
    productId: subscription.productId || APPLE_PRODUCT_ID,
    serverNow,
  };
}

module.exports = { ACTIVE_STATES, APPLE_PRODUCT_ID, STATES, deriveAppleEntitlement, publicAppleEntitlement };
