const PREMIUM_STATES = Object.freeze({
  ACTIVE: "ACTIVE",
  ACTIVE_CANCELS_AT_PERIOD_END: "ACTIVE_CANCELS_AT_PERIOD_END",
  GRACE_PERIOD: "GRACE_PERIOD",
  BILLING_RETRY: "BILLING_RETRY",
  EXPIRED: "EXPIRED",
  REVOKED: "REVOKED",
  REFUNDED: "REFUNDED",
  NONE: "NONE",
  UNKNOWN: "UNKNOWN",
});

const APPLE_SUBSCRIPTION_PRODUCT_IDS = Object.freeze({
  monthly: "com.skillomate.premium.monthly",
});

const ACCESS_STATES = new Set([
  PREMIUM_STATES.ACTIVE,
  PREMIUM_STATES.ACTIVE_CANCELS_AT_PERIOD_END,
  PREMIUM_STATES.GRACE_PERIOD,
]);

function validFutureTimestamp(value, serverNow = Date.now()) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) && timestamp > Number(serverNow);
}

function normalizeEntitlement(input, serverNow = Date.now()) {
  if (!input || typeof input !== "object") {
    return { state: PREMIUM_STATES.NONE, active: false, expiresAt: null };
  }

  const state = Object.values(PREMIUM_STATES).includes(input.entitlementState)
    ? input.entitlementState
    : PREMIUM_STATES.UNKNOWN;
  const expiresAt = input.expiresAt || input.subscriptionExpiry || input.currentPeriodEnd || null;
  const serverSaysActive = input.entitlementActive === true;
  const timeLimitedState = ACCESS_STATES.has(state);
  const active = serverSaysActive && timeLimitedState && validFutureTimestamp(expiresAt, serverNow);

  return { state, active, expiresAt };
}

function hasActivePremiumEntitlement(userOrSubscription, serverNow = Date.now()) {
  if (userOrSubscription?.entitlementState) {
    return normalizeEntitlement(userOrSubscription, serverNow).active;
  }

  // Backward compatibility for existing verified web/Android subscriptions. Explicitly
  // allow only known paid states and always honor an expiry when one is present.
  const status = String(userOrSubscription?.subscriptionStatus || "none").trim().toLowerCase();
  const expiry = userOrSubscription?.subscriptionExpiry;
  if (!["active", "subscribed", "trial", "1rs trial"].includes(status)) return false;
  return expiry ? validFutureTimestamp(expiry, serverNow) : ["active", "subscribed"].includes(status);
}

module.exports = {
  ACCESS_STATES,
  APPLE_SUBSCRIPTION_PRODUCT_IDS,
  PREMIUM_STATES,
  hasActivePremiumEntitlement,
  normalizeEntitlement,
  validFutureTimestamp,
};
