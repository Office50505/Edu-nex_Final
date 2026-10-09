const { resolveAllSubscriptionAccess } = require('./subscriptionAccess');

// The User fields are a cache. Rebuild them from all provider records rather
// than letting the last provider notification decide an account's access.
async function syncUserSubscriptionMirror(userId, dependencies = {}) {
  const User = dependencies.User || require('../models/User');
  const Subscription = dependencies.Subscription || require('../models/Subscription');
  const AppleSubscription = dependencies.AppleSubscription || require('../models/AppleSubscription');
  const GooglePlaySubscription = dependencies.GooglePlaySubscription || require('../models/GooglePlaySubscription');
  const now = dependencies.now === undefined ? Date.now() : Number(dependencies.now);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let userQuery = User.findById(userId);
    if (typeof userQuery?.select === 'function') userQuery = userQuery.select('_id subscriptionStatus subscriptionExpiry isOnTrial');
    // Lean preserves missing legacy fields, so schema defaults cannot make
    // the compare-and-set predicate differ from the persisted document.
    if (typeof userQuery?.lean === 'function') userQuery = userQuery.lean();
    const user = await userQuery;
    if (!user) return null;
    const [subscription, apple, google] = await Promise.all([
      Subscription.findOne({ user: userId }),
      AppleSubscription.findOne({ user: userId }),
      GooglePlaySubscription.findOne({ user: userId }),
    ]);
    const access = resolveAllSubscriptionAccess(subscription, apple, google, user, now);
    const result = await User.updateOne({
      _id: userId,
      subscriptionStatus: user.subscriptionStatus ?? null,
      subscriptionExpiry: user.subscriptionExpiry ?? null,
      isOnTrial: user.isOnTrial ?? null,
    }, { $set: {
      subscriptionStatus: access.active ? (access.status === 'trial' ? 'trial' : 'active') : 'expired',
      subscriptionExpiry: access.expiresAt || null,
      isOnTrial: access.active && access.status === 'trial',
    } });
    // Detect a concurrent User mirror write and reload before retrying.
    // Provider reads are not transactional: a later provider update must also
    // synchronize this cache. Authorization always checks provider records.
    if (result.matchedCount > 0) return access;
  }
  const error = new Error('Subscription access changed during reconciliation. Retry the refresh.');
  error.code = 'SUBSCRIPTION_MIRROR_CONFLICT';
  throw error;
}

module.exports = { syncUserSubscriptionMirror };
