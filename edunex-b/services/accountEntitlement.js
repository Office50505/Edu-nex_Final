const Subscription = require('../models/Subscription');
const AppleSubscription = require('../models/AppleSubscription');
const GooglePlaySubscription = require('../models/GooglePlaySubscription');
const { resolveAllSubscriptionAccess } = require('./subscriptionAccess');

async function leanResult(value) {
  return typeof value?.lean === 'function' ? value.lean() : value;
}

async function loadAccountEntitlement(user, dependencies = {}) {
  if (!user?._id) {
    const error = new Error('An authenticated Skillomate account is required.');
    error.statusCode = 401;
    throw error;
  }
  const models = {
    Subscription: dependencies.Subscription || Subscription,
    AppleSubscription: dependencies.AppleSubscription || AppleSubscription,
    GooglePlaySubscription: dependencies.GooglePlaySubscription || GooglePlaySubscription,
  };
  const now = dependencies.now === undefined ? Date.now() : Number(dependencies.now);
  const [subscription, appleSubscription, googlePlaySubscription] = await Promise.all([
    leanResult(models.Subscription.findOne({ user: user._id })),
    leanResult(models.AppleSubscription.findOne({ user: user._id })),
    leanResult(models.GooglePlaySubscription.findOne({ user: user._id })),
  ]);
  const access = resolveAllSubscriptionAccess(
    subscription,
    appleSubscription,
    googlePlaySubscription,
    user,
    now
  );
  return { access, subscription, appleSubscription, googlePlaySubscription };
}

function publicAccountEntitlement(result, serverNow = new Date()) {
  const { access, subscription } = result;
  return {
    subscriptionStatus: access.active ? (access.status === 'trial' ? 'trial' : 'active') : 'expired',
    subscriptionDocStatus: subscription?.status || null,
    subscriptionExpiry: access.expiresAt || null,
    entitlementState: access.entitlementState || (access.active ? 'ACTIVE' : 'NONE'),
    entitlementActive: access.active,
    entitlementSource: access.source || 'none',
    serverNow,
  };
}

module.exports = { loadAccountEntitlement, publicAccountEntitlement };
