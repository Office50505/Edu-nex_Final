const Subscription = require('../models/Subscription');

async function checkSubscription(req, res, next) {
  try {
    const subscription = await Subscription.findOne({ user: req.user._id });

    if (!subscription) {
      return res.status(403).json({ error: 'no_subscription' });
    }

    const now = new Date();

    if (subscription.status === 'trial' || subscription.status === '1rs trial') {
      if (subscription.trialExpiresAt && now < subscription.trialExpiresAt) {
        req.subscription = subscription;
        return next();
      }

      return res.status(403).json({ error: 'trial_expired' });
    }

    if (subscription.status === 'active' || subscription.status === 'subscribed') {
      if (subscription.currentPeriodEnd && now < subscription.currentPeriodEnd) {
        req.subscription = subscription;
        return next();
      }

      return res.status(403).json({ error: 'subscription_expired' });
    }

    return res.status(403).json({ error: 'no_subscription' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = { checkSubscription };
