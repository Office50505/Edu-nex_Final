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

// Runs every 15 minutes
cron.schedule('*/15 * * * *', async function promoteTrialsOnMandate() {
  console.log('[CRON] Promote 1rs-trial subscriptions on mandate started');
  try {
    const now = new Date();

    // Find users whose 24-hour trial window has expired but haven't yet been promoted
    const trialUsers = await User.find({
      subscriptionStatus: '1rs trial',
    }).select('_id');

    if (trialUsers.length === 0) {
      console.log('[CRON] No 1rs-trial users to process');
      return;
    }

    console.log(`[CRON] Found ${trialUsers.length} 1rs-trial user(s) to check`);

    const lookup = await Subscription.find({
      user: { $in: trialUsers.map((u) => u._id) },
    });

    const userIdToSub = new Map(lookup.map((s) => [String(s.user), s]));

    for (const user of trialUsers) {
      try {
        const sub = userIdToSub.get(String(user._id));
        if (!sub) continue;
        // If the trial window hasn't expired yet, skip until it does (idempotent guard)
        if (sub.trialExpiresAt && now < sub.trialExpiresAt) continue;

        // If the mandate has NOT been approved yet, keep '1rs trial' and wait for MANDATE_APPROVED
        // (the webhook will promote them immediately when the mandate arrives)
        if (!sub.phonePeMandateId) {
          console.log('[CRON] Trial expired but no mandate exists — skipping');
          continue;
        }

        // Mandate exists after trial window — promote to subscribed (₹500/month)
        const start = new Date();
        const end = addMonths(start, 1);
        const nextBilling = addMonths(start, 1);

        sub.status = 'subscribed';
        sub.subscriptionType = 'monthly';
        sub.trialConverted = true;
        sub.currentPeriodStart = start;
        sub.currentPeriodEnd = end;
        sub.nextBillingAt = nextBilling;
        await sub.save();

        await User.findByIdAndUpdate(user._id, {
          subscriptionStatus: 'subscribed',
        });

        await SubscriptionEvent.create({
          subscription: sub._id,
          user: user._id,
          event: 'SUBSCRIPTION_ACTIVATED',
          amount: sub.amount,
          metadata: { source: 'trial_promotion', via: 'cron_24h' },
        });

        console.log('[CRON] Promoted an eligible trial to subscribed');
      } catch (err) {
        console.error(`[CRON] Trial processing failed (${err?.code || err?.name || 'unknown'})`);
      }
    }
  } catch (err) {
    console.error('[CRON] PromoteTrialsOnMandate failed:', err);
  }
});

// Runs every 30 minutes
cron.schedule('*/30 * * * *', async function expireOverdueSubscriptions() {
  console.log('[CRON] Expire overdue subscriptions started');
  try {
    const now = new Date();
    const overdue = await Subscription.find({
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
