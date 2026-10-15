const PhonePeBilling = require('../models/PhonePeAutoPayBilling');
const Subscription = require('../models/Subscription');
const Order = require('../models/Order');
const provider = require('./phonePeStandardAutoPayService');
const controller = require('../controllers/phonePeStandardAutoPayController');

const IST_OFFSET_MINUTES = 330;
const NOTIFY_RETRY_BACKOFF_MINUTES = [5, 15, 30, 60, 180, 360];

function istMinuteOfDay(value) {
  const shifted = new Date(new Date(value).getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

function isPhonePeRetryWindow(value = new Date()) {
  const minute = istMinuteOfDay(value);
  return minute <= 599
    || (minute >= 781 && minute <= 1019)
    || minute >= 1291;
}

function istBoundary(value, hour, minute, addDays = 0) {
  const shifted = new Date(new Date(value).getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  return new Date(Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + addDays,
    hour,
    minute,
  ) - IST_OFFSET_MINUTES * 60 * 1000);
}

function nextPhonePeRetryWindow(value = new Date()) {
  const date = new Date(value);
  if (isPhonePeRetryWindow(date)) return date;
  const minute = istMinuteOfDay(date);
  if (minute < 781) return istBoundary(date, 13, 1);
  if (minute < 1291) return istBoundary(date, 21, 31);
  return istBoundary(date, 0, 0, 1);
}

function notifyRetryAt(attemptCount, now = new Date()) {
  const index = Math.min(Math.max(Number(attemptCount || 1) - 1, 0), NOTIFY_RETRY_BACKOFF_MINUTES.length - 1);
  const afterBackoff = new Date(new Date(now).getTime() + NOTIFY_RETRY_BACKOFF_MINUTES[index] * 60 * 1000);
  return nextPhonePeRetryWindow(afterBackoff);
}

function safeProviderFailure(error) {
  const clean = value => {
    if (value === undefined || value === null || value === '') return null;
    return String(value).replace(/[\r\n\t]/g, ' ').slice(0, 200);
  };
  const status = Number(error?.providerStatus);
  return {
    code: clean(error?.providerCode || error?.code || error?.name || 'PROVIDER_ERROR'),
    status: Number.isFinite(status) ? status : null,
    detailedCode: clean(error?.providerDetailedCode),
  };
}

async function recordNotifyFailure({ billingModel, billing, error, now, logger = console }) {
  const attemptCount = Number(billing.currentCycle?.notifyAttemptCount || 0) + 1;
  const retryAt = notifyRetryAt(attemptCount, now);
  const failure = safeProviderFailure(error);
  await billingModel.updateOne({
    _id: billing._id,
    'currentCycle.merchantOrderId': billing.currentCycle.merchantOrderId,
  }, { $set: {
    'currentCycle.notifyState': 'UNCERTAIN',
    'currentCycle.notifyAttemptCount': attemptCount,
    'currentCycle.notifyLastAttemptAt': now,
    'currentCycle.notifyRetryAt': retryAt,
    'currentCycle.notifyFailureCode': failure.code,
    'currentCycle.notifyFailureStatus': failure.status,
    'currentCycle.notifyFailureDetailedCode': failure.detailedCode,
  } });
  logger.error(`[PHONEPE_AUTOPAY] billing=${billing._id} action=notify_reconcile code=${failure.code || 'PROVIDER_ERROR'} status=${failure.status ?? 'unknown'} detailed=${failure.detailedCode || 'none'} retry_at=${retryAt.toISOString()}`);
  return retryAt;
}

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
  const expectedAmountType = billing.paymentType === 'trial' ? 'VARIABLE' : 'FIXED';
  const expectedFrequency = billing.paymentType === 'trial' ? 'ON_DEMAND' : 'MONTHLY';
  return mandate.state === 'ACTIVE'
    && mandate.maxAmount === provider.MONTHLY_AMOUNT_PAISE
    && mandate.amountType === expectedAmountType
    && mandate.frequency === expectedFrequency;
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
      'currentCycle.notifyAttemptCount': 1,
      'currentCycle.notifyLastAttemptAt': now,
      'currentCycle.notifyRetryAt': null,
      'currentCycle.notifyFailureCode': null,
      'currentCycle.notifyFailureStatus': null,
      'currentCycle.notifyFailureDetailedCode': null,
    } });
    return result;
  } catch (error) {
    // Do not blindly retry an uncertain provider create. The order-status
    // reconciliation path determines whether PhonePe accepted the request.
    await recordNotifyFailure({ billingModel: PhonePeBilling, billing: reserved, error, now }).catch(() => {});
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

async function processBilling(record, now = new Date(), dependencies = {}) {
  const billingModel = dependencies.billingModel || PhonePeBilling;
  const billingController = dependencies.controller || controller;
  const logger = dependencies.logger || console;
  let billing = record;
  if (billing.phase === 'setup_pending') {
    await billingController.reconcileSetup(billing);
    billing = await billingModel.findById(billing._id);
  }
  if (billing?.phase !== 'active' || billing.cancelledAt) return;
  if (billing.currentCycle?.merchantOrderId
    && billing.currentCycle.redeemState !== 'COMPLETED') {
    const uncertainNotification = billing.currentCycle.notifyState === 'UNCERTAIN'
      && !billing.currentCycle.redeemState;
    if (uncertainNotification) {
      const retryAt = billing.currentCycle.notifyRetryAt
        ? new Date(billing.currentCycle.notifyRetryAt)
        : nextPhonePeRetryWindow(now);
      if (retryAt > now || !isPhonePeRetryWindow(now)) {
        if (!billing.currentCycle.notifyRetryAt) {
          await billingModel.updateOne({
            _id: billing._id,
            'currentCycle.merchantOrderId': billing.currentCycle.merchantOrderId,
          }, { $set: { 'currentCycle.notifyRetryAt': retryAt } });
        }
        return { skipped: 'notify_retry_window', retryAt };
      }
    }
    try {
      await billingController.reconcileCycle(billing);
    } catch (error) {
      if (uncertainNotification) {
        const retryAt = await recordNotifyFailure({ billingModel, billing, error, now, logger });
        return { failed: 'notify_reconcile', retryAt };
      }
      throw error;
    }
    billing = await billingModel.findById(billing._id);
  }
  if (!billing || billing.phase !== 'active' || billing.cancelledAt) return;
  if (!billing.currentCycle || billing.currentCycle.redeemState === 'COMPLETED') {
    await submitNotification(billing, now);
    billing = await billingModel.findById(billing._id);
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
  isPhonePeRetryWindow,
  nextPhonePeRetryWindow,
  notifyRetryAt,
  safeProviderFailure,
  recordNotifyFailure,
  processBilling,
  runDueBillings,
};
