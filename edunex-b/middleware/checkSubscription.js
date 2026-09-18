const Subscription = require('../models/Subscription');
const { resolveSubscriptionAccess } = require('../services/subscriptionAccess');

async function checkSubscription(req, res, next) {
  try {
    const subscription = await Subscription.findOne({ user: req.user._id });

    if (!subscription) {
      return res.status(403).json({ error: 'no_subscription' });
    }

    const access = resolveSubscriptionAccess(subscription, req.user);
    if (!access.active) return res.status(403).json({ error: 'subscription_expired' });
    req.subscription = subscription;
    return next();
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = { checkSubscription };
