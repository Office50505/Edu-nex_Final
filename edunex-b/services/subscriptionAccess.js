function futureDate(value, now = Date.now()) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time > now;
}

function graceHours() {
  const hours = Number(process.env.SUBSCRIPTION_GRACE_HOURS || 48);
  return Number.isFinite(hours) && hours > 0 ? hours : 48;
}

function hasActiveMandate(subscription) {
  const status = String(subscription?.razorpayStatus || '').trim().toLowerCase();
  return Boolean(subscription?.razorpaySubscriptionId)
    && !subscription?.cancelledAt
    && ['active', 'authenticated'].includes(status);
}

function resolveRazorpayGrace(subscription, now = Date.now()) {
  if (!hasActiveMandate(subscription)) return null;
  const status = String(subscription?.status || '').trim().toLowerCase();
  if (!['trial', '1rs trial', 'pending', 'expired'].includes(status)) return null;
  const anchor = subscription?.trialExpiresAt || subscription?.nextBillingAt || null;
  if (!anchor) return null;
  const anchorTime = new Date(anchor).getTime();
  if (!Number.isFinite(anchorTime) || anchorTime > now) return null;
  const expiresAt = new Date(anchorTime + graceHours() * 60 * 60 * 1000);
  if (expiresAt.getTime() <= now) return null;
  return {
    active: true,
    status: 'trial',
    expiresAt,
    rawStatus: status,
    entitlementState: 'GRACE_PERIOD',
    source: 'razorpay_grace',
    grace: true,
    graceStartedAt: new Date(anchorTime),
    graceExpiresAt: expiresAt,
  };
}

function resolveSubscriptionAccess(subscription, user = {}, now = Date.now()) {
  const subscriptionStatus = String(subscription?.status || '').trim().toLowerCase();
  const userStatus = String(user?.subscriptionStatus || 'none').trim().toLowerCase();
  const rawStatus = subscriptionStatus || userStatus;
  const trialExpiresAt = subscription?.trialExpiresAt || null;
  const currentPeriodEnd = subscription?.currentPeriodEnd || null;

  // Cancellation prevents renewal; it must not revoke time that was already paid for.
  if (futureDate(trialExpiresAt, now)) {
    return { active: true, status: 'trial', expiresAt: trialExpiresAt, rawStatus };
  }
  if (futureDate(currentPeriodEnd, now)) {
    return { active: true, status: 'active', expiresAt: currentPeriodEnd, rawStatus };
  }
  if (['active', 'subscribed'].includes(subscriptionStatus) && !currentPeriodEnd) {
    return { active: true, status: 'active', expiresAt: null, rawStatus };
  }

  const grace = resolveRazorpayGrace(subscription, now);
  if (grace) return grace;

  const fallbackExpiry = user?.subscriptionExpiry || null;
  if (['trial', '1rs trial'].includes(userStatus) && futureDate(fallbackExpiry, now)) {
    return { active: true, status: 'trial', expiresAt: fallbackExpiry, rawStatus };
  }
  if (['active', 'subscribed'].includes(userStatus) && (!fallbackExpiry || futureDate(fallbackExpiry, now))) {
    return { active: true, status: 'active', expiresAt: fallbackExpiry, rawStatus };
  }

  return { active: false, status: 'none', expiresAt: null, rawStatus };
}

function resolveCombinedSubscriptionAccess(subscription, appleSubscription, user = {}, now = Date.now()) {
  if (appleSubscription) {
    const state = String(appleSubscription.entitlementState || 'UNKNOWN').toUpperCase();
    const expiresAt = state === 'GRACE_PERIOD'
      ? appleSubscription.gracePeriodExpiresAt
      : appleSubscription.expiresAt;
    if (['ACTIVE', 'ACTIVE_CANCELS_AT_PERIOD_END', 'GRACE_PERIOD'].includes(state) && futureDate(expiresAt, now)) {
      return { active: true, status: 'active', entitlementState: state, expiresAt, source: 'apple' };
    }
  }
  const legacy = resolveSubscriptionAccess(subscription, user, now);
  return {
    ...legacy,
    entitlementState: legacy.active ? 'ACTIVE' : (legacy.rawStatus === 'expired' ? 'EXPIRED' : 'NONE'),
    source: legacy.active ? 'legacy' : 'none',
  };
}

function resolveAllSubscriptionAccess(subscription, appleSubscription, googlePlaySubscription, user = {}, now = Date.now()) {
  if (appleSubscription) {
    const state = String(appleSubscription.entitlementState || 'UNKNOWN').toUpperCase();
    const expiresAt = state === 'GRACE_PERIOD'
      ? appleSubscription.gracePeriodExpiresAt
      : appleSubscription.expiresAt;
    if (['ACTIVE', 'ACTIVE_CANCELS_AT_PERIOD_END', 'GRACE_PERIOD'].includes(state) && futureDate(expiresAt, now)) {
      return { active: true, status: 'active', entitlementState: state, expiresAt, source: 'apple' };
    }
  }
  if (googlePlaySubscription) {
    const state = String(googlePlaySubscription.entitlementState || 'UNKNOWN').toUpperCase();
    const expiresAt = googlePlaySubscription.expiresAt || null;
    if (['ACTIVE', 'ACTIVE_CANCELS_AT_PERIOD_END', 'GRACE_PERIOD'].includes(state) && futureDate(expiresAt, now)) {
      return { active: true, status: 'active', entitlementState: state, expiresAt, source: 'google_play' };
    }
  }
  // Once a store record exists, do not let a stale denormalized User status
  // reactivate an expired/revoked store entitlement. A separate legacy billing
  // Subscription record can still grant its own paid period.
  const legacy = resolveSubscriptionAccess(
    subscription,
    (appleSubscription || googlePlaySubscription) ? {} : user,
    now
  );
  return {
    ...legacy,
    entitlementState: legacy.active ? 'ACTIVE' : (legacy.rawStatus === 'expired' ? 'EXPIRED' : 'NONE'),
    source: legacy.active ? 'legacy' : 'none',
  };
}

module.exports = { futureDate, hasActiveMandate, resolveRazorpayGrace, resolveAllSubscriptionAccess, resolveCombinedSubscriptionAccess, resolveSubscriptionAccess };
