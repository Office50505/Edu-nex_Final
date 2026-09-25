const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

function subscriptionChange(input, previous = {}, billing, now = new Date()) {
  const status = input.status ?? ({ grant: 'subscribed', revoke: 'none' }[input.action]);
  if (!['none', 'trial', 'subscribed'].includes(status)) throw fail('Choose None, Trial or Subscribed.');
  const reason = String(input.reason || '').trim().slice(0, 500);
  if (!reason) throw fail('A reason is required.');
  const terminal = ['cancelled', 'completed', 'expired'];
  if ((billing && billing.phase !== 'closed')
    || (previous.razorpaySubscriptionId && !terminal.includes(previous.razorpayStatus))
    || (previous.phonePeMandateId && !previous.cancelledAt)) {
    throw fail('Resolve or cancel the existing payment setup before changing subscription access. This change does not cancel AutoPay.', 409);
  }
  const days = Number(input.durationDays ?? (status === 'trial' ? 1 : 30));
  if (status !== 'none' && (!Number.isInteger(days) || days < 1 || days > 3650)) {
    throw fail('Access duration must be a whole number from 1 to 3650 days.');
  }
  const expiresAt = status === 'none' ? null : new Date(now.getTime() + days * 86400000);
  return {
    status, reason,
    user: { subscriptionStatus: status, subscriptionExpiry: expiresAt, isOnTrial: status === 'trial' },
    subscription: {
      gateway: 'admin', status: status === 'none' ? 'paused' : status,
      subscriptionType: status === 'trial' ? 'trial' : 'monthly',
      // Retain trial history, but clear every date that could keep old access alive.
      trialStartedAt: status === 'trial' ? now : previous.trialStartedAt || null,
      trialExpiresAt: status === 'trial' ? expiresAt : null,
      currentPeriodStart: status === 'subscribed' ? now : null,
      currentPeriodEnd: status === 'subscribed' ? expiresAt : null,
      nextBillingAt: null, cancelledAt: status === 'none' ? now : null,
      cancelReason: status === 'none' ? `Admin: ${reason}` : null,
      phonePeMerchantId: previous.phonePeMerchantId || 'admin-manual',
      adminBillingSubscriptionId: billing?.subscriptionId || null,
    },
  };
}

module.exports = { subscriptionChange };
