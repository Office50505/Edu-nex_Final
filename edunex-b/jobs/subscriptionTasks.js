const cron = require('node-cron');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Order = require('../models/Order');
const SubscriptionEvent = require('../models/SubscriptionEvent');

function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

// Paid access is granted only by verified provider reconciliation, never by a mandate timer.

// Runs every 30 minutes
cron.schedule('*/30 * * * *', async function expireOverdueSubscriptions() {
  console.log('[CRON] Expire overdue subscriptions started');
  try {
    const now = new Date();
    const overdue = await Subscription.find({
      gateway: { $ne: 'razorpay' },
      status: { $in: ['active', 'subscribed'] },
      currentPeriodEnd: { $ne: null, $lte: now },
    }).select('_id user currentPeriodEnd');

    if (!overdue.length) {
      console.log('[CRON] No overdue subscriptions found');
      return;
    }

    const userIds = overdue.map((item) => item.user);
    const subIds = overdue.map((item) => item._id);

    await Subscription.updateMany(
      { _id: { $in: subIds } },
      {
        $set: {
          status: 'expired',
        },
      }
    );

    await User.updateMany(
      { _id: { $in: userIds } },
      {
        $set: { subscriptionStatus: 'expired' },
      }
    );

    await SubscriptionEvent.insertMany(
      overdue.map((sub) => ({
        subscription: sub._id,
        user: sub.user,
        event: 'PAYMENT_FAILED',
        metadata: {
          source: 'cron_expiry',
          reason: 'current_period_elapsed_without_renewal',
          expiredAt: new Date(),
        },
      }))
    );

    console.log(`[CRON] Expired ${overdue.length} subscription(s)`);
  } catch (err) {
    console.error('[CRON] Expire overdue subscriptions failed:', err);
  }
});
