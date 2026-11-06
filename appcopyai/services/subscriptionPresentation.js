const { hasActivePremiumEntitlement, PREMIUM_STATES } = require('./subscriptions');

// Use one access decision for every current-plan label. Billing status alone
// can be stale after a store or administrative entitlement changes.
function subscriptionPresentation(subscription, now = Date.now()) {
  const data = subscription || {};
  const active = data.entitlementActive !== false && hasActivePremiumEntitlement(data, now);
  const status = String(data.subscriptionStatus || 'none').trim().toLowerCase();
  const state = data.entitlementState;
  const rawExpiry = state === PREMIUM_STATES.GRACE_PERIOD
    ? data.gracePeriodExpiresAt || data.subscriptionExpiry
    : data.expiresAt || data.subscriptionExpiry || data.currentPeriodEnd;
  const timestamp = rawExpiry ? new Date(rawExpiry).getTime() : NaN;
  const expiresAt = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
  const noPlan = state === PREMIUM_STATES.NONE || (!state && status === 'none');
  let planLabel = active ? (['trial', '1rs trial'].includes(status) ? 'Trial' : 'Premium') : 'Inactive';
  if (!active) {
    if (noPlan) planLabel = 'Free';
    else if (state === PREMIUM_STATES.REFUNDED) planLabel = 'Refunded';
    else if (state === PREMIUM_STATES.REVOKED) planLabel = 'Revoked';
    else if (state === PREMIUM_STATES.EXPIRED || (!state && status === 'expired')
      || (expiresAt && timestamp <= now)) planLabel = 'Expired';
  }
  return {
    active,
    planLabel,
    badgeLabel: active ? 'ACTIVE' : 'INACTIVE',
    expiresAt: noPlan ? null : expiresAt,
    expiryLabel: active ? 'Valid Until' : expiresAt && !noPlan ? 'Expiry Date' : 'Valid Until',
    missingExpiryLabel: active ? 'Not provided' : '—',
    daysRemaining: active && expiresAt ? Math.max(0, Math.ceil((timestamp - now) / 86400000)) : 0,
  };
}

module.exports = { subscriptionPresentation };
