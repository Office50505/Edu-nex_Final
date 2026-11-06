const GOOGLE_PLAY_PACKAGE_NAME = String(process.env.GOOGLE_PLAY_PACKAGE_NAME || '').trim() || 'com.skillomate.app';
const GOOGLE_PLAY_PRODUCT_ID = String(process.env.GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID || '').trim() || 'skillomate_premium_monthly';
const GOOGLE_PLAY_INTRODUCTORY_OFFER_ID = String(process.env.GOOGLE_PLAY_INTRODUCTORY_OFFER_ID || '').trim() || 'intro-9rs-3days';

const STATES = Object.freeze({
  ACTIVE: 'ACTIVE',
  ACTIVE_CANCELS_AT_PERIOD_END: 'ACTIVE_CANCELS_AT_PERIOD_END',
  GRACE_PERIOD: 'GRACE_PERIOD',
  BILLING_RETRY: 'BILLING_RETRY',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
  NONE: 'NONE',
  UNKNOWN: 'UNKNOWN',
});

const ACTIVE_STATES = new Set([
  STATES.ACTIVE,
  STATES.ACTIVE_CANCELS_AT_PERIOD_END,
  STATES.GRACE_PERIOD,
]);

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function currentEntitlementState(state, expiresAt, now) {
  if (!ACTIVE_STATES.has(state)) return state;
  if (!expiresAt) return STATES.UNKNOWN;
  return expiresAt.getTime() > now ? state : STATES.EXPIRED;
}

function latestMatchingLineItem(snapshot = {}) {
  return (Array.isArray(snapshot.lineItems) ? snapshot.lineItems : [])
    .filter(item => item?.productId === GOOGLE_PLAY_PRODUCT_ID)
    .sort((left, right) => (validDate(right?.expiryTime)?.getTime() || 0) - (validDate(left?.expiryTime)?.getTime() || 0))[0] || null;
}

function deriveGooglePlayEntitlement(snapshot = {}, now = Date.now()) {
  const lineItem = latestMatchingLineItem(snapshot);
  const expiresAt = validDate(lineItem?.expiryTime);
  const autoRenewEnabled = lineItem?.autoRenewingPlan?.autoRenewEnabled ?? null;
  const playState = String(snapshot.subscriptionState || '').toUpperCase();
  let entitlementState = STATES.UNKNOWN;

  if (playState === 'SUBSCRIPTION_STATE_ACTIVE') {
    entitlementState = autoRenewEnabled === false ? STATES.ACTIVE_CANCELS_AT_PERIOD_END : STATES.ACTIVE;
  } else if (playState === 'SUBSCRIPTION_STATE_CANCELED') {
    entitlementState = expiresAt?.getTime() > now ? STATES.ACTIVE_CANCELS_AT_PERIOD_END : STATES.EXPIRED;
  } else if (playState === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD') {
    entitlementState = STATES.GRACE_PERIOD;
  } else if (['SUBSCRIPTION_STATE_ON_HOLD', 'SUBSCRIPTION_STATE_PAUSED', 'SUBSCRIPTION_STATE_PENDING'].includes(playState)) {
    entitlementState = STATES.BILLING_RETRY;
  } else if (playState === 'SUBSCRIPTION_STATE_EXPIRED') {
    entitlementState = STATES.EXPIRED;
  } else if (playState === 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED') {
    entitlementState = STATES.REVOKED;
  }

  entitlementState = currentEntitlementState(entitlementState, expiresAt, now);
  const entitlementActive = ACTIVE_STATES.has(entitlementState)
    && Boolean(expiresAt && expiresAt.getTime() > now);
  return {
    acknowledgementState: snapshot.acknowledgementState || null,
    autoRenewEnabled,
    basePlanId: lineItem?.offerDetails?.basePlanId || null,
    entitlementActive,
    entitlementState,
    expiresAt,
    latestOrderId: snapshot.latestOrderId || lineItem?.latestSuccessfulOrderId || null,
    offerId: lineItem?.offerDetails?.offerId || null,
    productId: lineItem?.productId || GOOGLE_PLAY_PRODUCT_ID,
    subscriptionState: snapshot.subscriptionState || null,
  };
}

function publicGooglePlayEntitlement(subscription, serverNow = new Date()) {
  if (!subscription) {
    return {
      entitlementState: STATES.NONE,
      entitlementActive: false,
      expiresAt: null,
      gracePeriodExpiresAt: null,
      acknowledgementState: null,
      productId: GOOGLE_PLAY_PRODUCT_ID,
      serverNow,
    };
  }
  const expiresAt = validDate(subscription.expiresAt);
  const productMatches = !subscription.productId || subscription.productId === GOOGLE_PLAY_PRODUCT_ID;
  const packageMatches = !subscription.packageName || subscription.packageName === GOOGLE_PLAY_PACKAGE_NAME;
  const entitlementState = productMatches && packageMatches
    ? currentEntitlementState(subscription.entitlementState || STATES.UNKNOWN, expiresAt, serverNow.getTime())
    : STATES.UNKNOWN;
  const entitlementActive = ACTIVE_STATES.has(entitlementState)
    && Boolean(expiresAt && expiresAt.getTime() > serverNow.getTime());
  return {
    entitlementState,
    entitlementActive,
    expiresAt,
    // Play extends expiryTime during grace; the mobile entitlement contract uses this field.
    gracePeriodExpiresAt: entitlementState === STATES.GRACE_PERIOD ? expiresAt : null,
    acknowledgementState: subscription.acknowledgementState || null,
    subscriptionState: subscription.subscriptionState || null,
    autoRenewEnabled: subscription.autoRenewEnabled ?? null,
    productId: subscription.productId || GOOGLE_PLAY_PRODUCT_ID,
    basePlanId: subscription.basePlanId || null,
    offerId: subscription.offerId || null,
    serverNow,
  };
}

module.exports = {
  ACTIVE_STATES,
  GOOGLE_PLAY_INTRODUCTORY_OFFER_ID,
  GOOGLE_PLAY_PACKAGE_NAME,
  GOOGLE_PLAY_PRODUCT_ID,
  STATES,
  deriveGooglePlayEntitlement,
  latestMatchingLineItem,
  publicGooglePlayEntitlement,
};
