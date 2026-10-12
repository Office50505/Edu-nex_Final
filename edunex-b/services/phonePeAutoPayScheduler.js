const PhonePeBilling = require('../models/PhonePeAutoPayBilling');
const Subscription = require('../models/Subscription');
const Order = require('../models/Order');
const provider = require('./phonePeStandardAutoPayService');
const controller = require('../controllers/phonePeStandardAutoPayController');

function generatedCycleId(sequence) {
  const time = Date.now().toString(36).toUpperCase();
  const random = require('node:crypto').randomBytes(6).toString('hex').toUpperCase();
  return `PPR_${sequence}_${time}_${random}`;
}

function notificationDueAt(billing) {
  if (!billing?.nextBillingAt) return null;
  return new Date(new Date(billing.nextBillingAt).getTime() - provider.TRIAL_HOURS * 60 * 60 * 1000);
}

async function activeMandate(billing) {
  const mandate = await provider.getSubscriptionStatus(billing.merchantSubscriptionId);
  await PhonePeBilling.updateOne({ _id: billing._id }, { $set: {
    providerState: mandate.state,
    phonePeSubscriptionId: mandate.subscriptionId || billing.phonePeSubscriptionId,
  } });
  return mandate.state === 'ACTIVE'
    && mandate.maxAmount === provider.MONTHLY_AMOUNT_PAISE
    && mandate.amountType === 'FIXED'
    && mandate.frequency === 'MONTHLY';
}

async function reserveCycle(billing, now) {
  const current = billing.currentCycle;
  if (current && current.redeemState !== 'COMPLETED') return null;
  const dueAt = notificationDueAt(billing);
  if (!dueAt || dueAt > now) return null;
  const sequence = Number(current?.sequence || 0) + 1;
  const merchantOrderId = generatedCycleId(sequence);
  const predicate = {
    _id: billing._id,
    phase: 'active',
    cancelledAt: null,
    nextBillingAt: billing.nextBillingAt,
    ...(current
      ? { 'currentCycle.merchantOrderId': current.merchantOrderId, 'currentCycle.redeemState': 'COMPLETED' }
      : { $or: [{ currentCycle: null }, { currentCycle: { $exists: false } }] }),
  };
  return PhonePeBilling.findOneAndUpdate(predicate, { $set: {
    currentCycle: {
      sequence,
      merchantOrderId,
      notifyState: 'REQUESTING',
      notifiedAt: now,
      redeemState: null,
    },
  } }, { new: true, runValidators: true });
}

async function submitNotification(billing, now = new Date()) {
  if (!await activeMandate(billing)) return null;
  const reserved = await reserveCycle(billing, now);
  if (!reserved) return null;
  const subscription = await Subscription.findOne({ user: reserved._id }).select('_id');
  try {
    await Order.create({
      user: reserved._id,
      subscription: subscription?._id || null,
      totalAmount: provider.MONTHLY_AMOUNT_PAISE,
      gateway: 'phonepe',
      phonePeMerchantTransactionId: reserved.currentCycle.merchantOrderId,
      phonePeMerchantSubscriptionId: reserved.merchantSubscriptionId,
      orderType: 'subscription_charge',
      status: 'pending',
    });
    const result = await provider.notifyRedemption({
      merchantOrderId: reserved.currentCycle.merchantOrderId,
      merchantSubscriptionId: reserved.merchantSubscriptionId,
      userId: reserved._id,
      cycle: reserved.currentCycle.sequence,
    });
    await PhonePeBilling.updateOne({
      _id: reserved._id,
      'currentCycle.merchantOrderId': reserved.currentCycle.merchantOrderId,
      'currentCycle.notifyState': 'REQUESTING',
    }, { $set: {
      'currentCycle.phonePeOrderId': result.orderId,
      'currentCycle.notifyState': result.state,
    } });
    return result;
  } catch (error) {
    // Do not blindly retry an uncertain provider create. The order-status
    // reconciliation path determines whether PhonePe accepted the request.
    await PhonePeBilling.updateOne({
      _id: reserved._id,
      'currentCycle.merchantOrderId': reserved.currentCycle.merchantOrderId,
    }, { $set: { 'currentCycle.notifyState': 'UNCERTAIN' } }).catch(() => {});
    throw error;
  }
}

async function executeDueRedemption(billing, now = new Date()) {
  const cycle = billing.currentCycle;
  if (!cycle?.merchantOrderId || cycle.notifyState !== 'NOTIFIED' || cycle.redeemState === 'COMPLETED') return null;
  if (!cycle.validAfter || new Date(cycle.validAfter) > now) return null;
  if (billing.cancelledAt || billing.phase !== 'active') return null;
  if (!await activeMandate(billing)) return null;
  const reserved = await PhonePeBilling.findOneAndUpdate({
    _id: billing._id,
    phase: 'active',
    cancelledAt: null,
    'currentCycle.merchantOrderId': cycle.merchantOrderId,
    'currentCycle.notifyState': 'NOTIFIED',
    'currentCycle.redeemState': { $nin: ['REQUESTING', 'PENDING', 'COMPLETED'] },
  }, { $set: {
    'currentCycle.redeemState': 'REQUESTING',
    'currentCycle.executeRequestedAt': now,
  } }, { new: true });
  if (!reserved) return null;
  try {
    const result = await provider.redeem(cycle.merchantOrderId);
    await PhonePeBilling.updateOne({
      _id: billing._id,
      'currentCycle.merchantOrderId': cycle.merchantOrderId,
      'currentCycle.redeemState': 'REQUESTING',
    }, { $set: {
      'currentCycle.redeemState': result.state,
      'currentCycle.phonePeTransactionId': result.transactionId,
    } });
    return result;
  } catch (error) {
    // An execute timeout can still mean PhonePe accepted the debit. Preserve
    // REQUESTING and recover only through the read-only order-status API.
    throw error;
  }
}

async function processBilling(record, now = new Date()) {
  let billing = record;
  if (billing.phase === 'setup_pending') {
    await controller.reconcileSetup(billing);
    billing = await PhonePeBilling.findById(billing._id);
  }
  if (billing?.phase !== 'active' || billing.cancelledAt) return;
  if (billing.currentCycle?.merchantOrderId
    && billing.currentCycle.redeemState !== 'COMPLETED') {
    try { await controller.reconcileCycle(billing); }
    catch { return; }
    billing = await PhonePeBilling.findById(billing._id);
  }
  if (!billing || billing.phase !== 'active' || billing.cancelledAt) return;
  if (!billing.currentCycle || billing.currentCycle.redeemState === 'COMPLETED') {
    await submitNotification(billing, now);
    billing = await PhonePeBilling.findById(billing._id);
  }
  if (billing) await executeDueRedemption(billing, now);
}

async function runDueBillings({ now = new Date(), limit = 50 } = {}) {
  const c = provider.config();
  if (!c.enabled || !c.schedulerEnabled) return { enabled: false, processed: 0 };
  if (c.mode === 'live' && !c.liveRecurringEnabled) {
    return { enabled: false, processed: 0, reason: 'live_recurring_disabled' };
  }
  provider.requireConfigured({ allowWebDisabled: true, recurringDebit: true });
  const rows = await PhonePeBilling.find({
    phase: { $in: ['setup_pending', 'active'] },
    cancelledAt: null,
  }).sort({ nextBillingAt: 1, updatedAt: 1 }).limit(limit);
  let processed = 0;
  for (const row of rows) {
    try {
      await processBilling(row, now);
      processed += 1;
    } catch (error) {
      console.error(`[PHONEPE_AUTOPAY] billing=${row._id} action=scheduler error=${error.providerCode || error.code || error.name || 'provider_error'}`);
    }
  }
  return { enabled: true, processed };
}

module.exports = {
  notificationDueAt,
  activeMandate,
  reserveCycle,
  submitNotification,
  executeDueRedemption,
  processBilling,
  runDueBillings,
};
