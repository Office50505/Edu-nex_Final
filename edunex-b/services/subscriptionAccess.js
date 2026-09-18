function futureDate(value, now = Date.now()) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time > now;
}

function resolveSubscriptionAccess(subscription, user = {}, now = Date.now()) {
  const rawStatus = String(subscription?.status || user?.subscriptionStatus || 'none').trim().toLowerCase();
  const trialExpiresAt = subscription?.trialExpiresAt || null;
  const currentPeriodEnd = subscription?.currentPeriodEnd || null;

  // Cancellation prevents renewal; it must not revoke time that was already paid for.
  if (futureDate(trialExpiresAt, now)) {
    return { active: true, status: 'trial', expiresAt: trialExpiresAt, rawStatus };
  }
  if (futureDate(currentPeriodEnd, now)) {
    return { active: true, status: 'active', expiresAt: currentPeriodEnd, rawStatus };
  }

  if (!subscription && ['trial', '1rs trial', 'active', 'subscribed'].includes(rawStatus)) {
    const fallbackExpiry = user?.subscriptionExpiry || null;
    if (!fallbackExpiry || futureDate(fallbackExpiry, now)) {
      return {
        active: true,
        status: ['trial', '1rs trial'].includes(rawStatus) ? 'trial' : 'active',
        expiresAt: fallbackExpiry,
        rawStatus,
      };
    }
  }

  return { active: false, status: 'none', expiresAt: null, rawStatus };
}

module.exports = { futureDate, resolveSubscriptionAccess };
