const GOOGLE_PLAY_PACKAGE_NAME = process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.skillomate.app';
const GOOGLE_PLAY_PRODUCT_ID = process.env.GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID || 'skillomate_premium_monthly';
const GOOGLE_PLAY_INTRODUCTORY_OFFER_ID = process.env.GOOGLE_PLAY_INTRODUCTORY_OFFER_ID || 'new-subscriber-1rs-24h';

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

function latestMatchingLineItem(snapshot = {}) {
  return (Array.isArray(snapshot.lineItems) ? snapshot.lineItems : [])
    .filter(item => item?.productId === GOOGLE_PLAY_PRODUCT_ID)
    .sort((left, right) => new Date(right?.expiryTime || 0) - new Date(left?.expiryTime || 0))[0] || null;
}

function deriveGooglePlayEntitlement(snapshot = {}, now = Date.now()) {
  const lineItem = latestMatchingLineItem(snapshot);
  const expiresAt = lineItem?.expiryTime ? new Date(lineItem.expiryTime) : null;
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
      productId: GOOGLE_PLAY_PRODUCT_ID,
      serverNow,
    };
  }
  const expiresAt = subscription.expiresAt || null;
  const entitlementActive = ACTIVE_STATES.has(subscription.entitlementState)
    && new Date(expiresAt || 0).getTime() > serverNow.getTime();
  return {
    entitlementState: subscription.entitlementState || STATES.UNKNOWN,
    entitlementActive,
    expiresAt,
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
