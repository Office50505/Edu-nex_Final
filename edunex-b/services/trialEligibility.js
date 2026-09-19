const Order = require('../models/Order');

function hasTrialHistoryMarker(subscription, user = {}) {
  const subscriptionStatus = String(subscription?.status || '').trim().toLowerCase();
  const userStatus = String(user?.subscriptionStatus || '').trim().toLowerCase();

  return Boolean(
    subscription?.trialStartedAt
    || ['trial', '1rs trial'].includes(subscriptionStatus)
    || ['trial', '1rs trial'].includes(userStatus)
  );
}

async function hasUsedIntroTrial(userId, subscription, user = {}, orderModel = Order) {
  if (hasTrialHistoryMarker(subscription, user)) return true;

  return Boolean(await orderModel.exists({
    user: userId,
    orderType: 'trial_charge',
    status: 'paid',
  }));
}

module.exports = { hasTrialHistoryMarker, hasUsedIntroTrial };
