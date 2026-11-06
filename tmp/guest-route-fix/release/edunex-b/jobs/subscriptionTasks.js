const cron = require('node-cron');
const Subscription = require('../models/Subscription');
const SubscriptionEvent = require('../models/SubscriptionEvent');
const { scheduleLockedJob } = require('../services/distributedLock');
const { syncUserSubscriptionMirror } = require('../services/subscriptionMirror');

const SUBSCRIPTION_EXPIRY_LOCK_TTL_MS = 15 * 60 * 1000;

// Paid access is granted only by verified provider reconciliation, never by a mandate timer.

// Runs every 30 minutes
async function expireOverdueSubscriptions() {
  console.log('[CRON] Expire overdue subscriptions started');
  try {
    const now = new Date();
    const overdue = await Subscription.find({
      $or: [
        {
          gateway: { $ne: 'razorpay' },
          status: { $in: ['active', 'subscribed'] },
          currentPeriodEnd: { $ne: null, $lte: now },
        },
        {
          status: { $in: ['trial', '1rs trial'] },
          trialExpiresAt: { $ne: null, $lte: now },
          $or: [
            { cancelledAt: { $ne: null } },
            { razorpayStatus: { $in: ['cancelled', 'expired', 'halted'] } },
            {
              gateway: { $ne: 'razorpay' },
              $or: [
                { currentPeriodEnd: null },
                { currentPeriodEnd: { $exists: false } },
                { currentPeriodEnd: { $lte: now } },
              ],
            },
          ],
        },
      ],
    }).select('_id user status gateway currentPeriodEnd trialExpiresAt razorpayStatus cancelledAt');

    if (!overdue.length) {
      console.log('[CRON] No overdue subscriptions found');
      return;
    }

    const expired = [];
    for (const sub of overdue) {
      // Expired timestamps already deny access in the resolver. Reconcile
      // first so a failed mirror write leaves this row eligible for retry.
      await syncUserSubscriptionMirror(sub.user, { now });
      const updated = await Subscription.findOneAndUpdate({
        _id: sub._id,
        status: sub.status,
        currentPeriodEnd: sub.currentPeriodEnd ?? null,
        trialExpiresAt: sub.trialExpiresAt ?? null,
        razorpayStatus: sub.razorpayStatus ?? null,
        cancelledAt: sub.cancelledAt ?? null,
      }, { $set: { status: 'expired' } }, { new: true });
      if (updated) expired.push(sub);
      // A renewal/cancellation changed the row after the scan. Preserve it
      // and refresh the mirror against that newer provider state.
      else await syncUserSubscriptionMirror(sub.user, { now });
    }

    if (expired.length) await SubscriptionEvent.insertMany(
      expired.map((sub) => ({
        subscription: sub._id,
        user: sub.user,
        event: 'PAYMENT_FAILED',
        metadata: {
          source: 'cron_expiry',
          reason: ['trial', '1rs trial'].includes(sub.status)
            ? 'trial_elapsed_without_paid_renewal'
            : 'current_period_elapsed_without_renewal',
          previousStatus: sub.status,
          gateway: sub.gateway,
          providerStatus: sub.razorpayStatus || null,
          cancelledAt: sub.cancelledAt || null,
          expiredAt: new Date(),
        },
      }))
    );

    console.log(`[CRON] Expired ${expired.length} subscription(s)`);
  } catch (err) {
    console.error(`[CRON] Expire overdue subscriptions failed (${err?.code || err?.name || 'unknown'})`);
  }
}

scheduleLockedJob({
  cron,
  expression: '*/30 * * * *',
  jobName: 'subscription-expiry',
  lockTtlMs: SUBSCRIPTION_EXPIRY_LOCK_TTL_MS,
  task: expireOverdueSubscriptions,
});
