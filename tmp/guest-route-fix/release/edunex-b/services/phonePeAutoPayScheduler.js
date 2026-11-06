const PhonePeBilling = require('../models/PhonePeAutoPayBilling');
const Subscription = require('../models/Subscription');
const Order = require('../models/Order');
const provider = require('./phonePeStandardAutoPayService');
const controller = require('../controllers/phonePeStandardAutoPayController');

const IST_OFFSET_MINUTES = 330;
const NOTIFY_RETRY_BACKOFF_MINUTES = [5, 15, 30, 60, 180, 360];
const EXECUTE_RETRY_BACKOFF_MINUTES = [5, 15, 30, 60, 180, 360];
const TERMINAL_REDEEM_STATES = new Set(['COMPLETED', 'FAILED', 'EXPIRED']);

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

function executeRetryAt(attemptCount, now = new Date()) {
  const index = Math.min(Math.max(Number(attemptCount || 1) - 1, 0), EXECUTE_RETRY_BACKOFF_MINUTES.length - 1);
  return new Date(new Date(now).getTime() + EXECUTE_RETRY_BACKOFF_MINUTES[index] * 60 * 1000);
}

function safeProviderFailure(error) {
  const clean = value => {
    if (value === undefined || value === null || value === '') return null;
    return String(value)
      .replace(/(?:O-)?Bearer\s+[A-Za-z0-9._~-]+/gi, '[redacted-auth]')
      .replace(/[\r\n\t]/g, ' ')
      .slice(0, 300);
  };
  const status = Number(error?.providerStatus);
  return {
    code: clean(error?.providerCode || error?.code || error?.name || 'PROVIDER_ERROR'),
    status: Number.isFinite(status) ? status : null,
    detailedCode: clean(error?.providerDetailedCode),
    message: error?.providerStatus ? clean(error?.message) : null,
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
    'currentCycle.notifyFailureMessage': failure.message,
  } });
  logger.error(`[PHONEPE_AUTOPAY] billing=${billing._id} action=notify_reconcile code=${failure.code || 'PROVIDER_ERROR'} status=${failure.status ?? 'unknown'} detailed=${failure.detailedCode || 'none'} retry_at=${retryAt.toISOString()}`);
  return retryAt;
}

async function recordExecuteFailure({ billingModel, billing, error, now, logger = console }) {
  const attemptCount = Math.max(Number(billing.currentCycle?.executeAttemptCount || 0), 1);
  const retryAt = executeRetryAt(attemptCount, now);
  const failure = safeProviderFailure(error);
  await billingModel.updateOne({
    _id: billing._id,
    'currentCycle.merchantOrderId': billing.currentCycle.merchantOrderId,
    'currentCycle.redeemState': 'REQUESTING',
  }, { $set: {
    'currentCycle.executeAttemptCount': attemptCount,
    'currentCycle.executeLastAttemptAt': now,
    'currentCycle.executeRetryAt': retryAt,
    'currentCycle.executeFailureCode': failure.code,
    'currentCycle.executeFailureStatus': failure.status,
    'currentCycle.executeFailureDetailedCode': failure.detailedCode,
    'currentCycle.executeFailureMessage': failure.message,
  } });
  logger.error(`[PHONEPE_AUTOPAY] billing=${billing._id} action=execute_reconcile code=${failure.code || 'PROVIDER_ERROR'} status=${failure.status ?? 'unknown'} detailed=${failure.detailedCode || 'none'} retry_at=${retryAt.toISOString()}`);
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

async function activeMandate(billing, dependencies = {}) {
  const phonePeProvider = dependencies.provider || provider;
  const billingModel = dependencies.billingModel || PhonePeBilling;
  const mandate = await phonePeProvider.getSubscriptionStatus(billing.merchantSubscriptionId);
  await billingModel.updateOne({ _id: billing._id }, { $set: {
    providerState: mandate.state,
    phonePeSubscriptionId: mandate.subscriptionId || billing.phonePeSubscriptionId,
  } });
  const expectedAmountType = billing.paymentType === 'trial' ? 'VARIABLE' : 'FIXED';
  const expectedFrequency = billing.paymentType === 'trial' ? 'ON_DEMAND' : 'MONTHLY';
  return mandate.state === 'ACTIVE'
    && mandate.maxAmount === phonePeProvider.MONTHLY_AMOUNT_PAISE
    && mandate.amountType === expectedAmountType
    && mandate.frequency === expectedFrequency;
}

async function reserveCycle(billing, now, dependencies = {}) {
  const billingModel = dependencies.billingModel || PhonePeBilling;
  const current = billing.currentCycle;
  if (current && !TERMINAL_REDEEM_STATES.has(current.redeemState)) return null;
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
      ? { 'currentCycle.merchantOrderId': current.merchantOrderId, 'currentCycle.redeemState': current.redeemState }
      : { $or: [{ currentCycle: null }, { currentCycle: { $exists: false } }] }),
  };
  return billingModel.findOneAndUpdate(predicate, { $set: {
    currentCycle: {
      sequence,
      merchantOrderId,
      notifyState: 'REQUESTING',
      notifiedAt: now,
      redeemState: null,
    },
  } }, { new: true, runValidators: true });
}

async function submitNotification(billing, now = new Date(), dependencies = {}) {
  const billingModel = dependencies.billingModel || PhonePeBilling;
  const subscriptionModel = dependencies.subscriptionModel || Subscription;
  const orderModel = dependencies.orderModel || Order;
  const phonePeProvider = dependencies.provider || provider;
  if (!await activeMandate(billing, { billingModel, provider: phonePeProvider })) return null;
  const reserved = await reserveCycle(billing, now, { billingModel });
  if (!reserved) return null;
  const subscription = await subscriptionModel.findOne({ user: reserved._id }).select('_id');
  try {
    await orderModel.create({
      user: reserved._id,
      subscription: subscription?._id || null,
      totalAmount: phonePeProvider.MONTHLY_AMOUNT_PAISE,
      gateway: 'phonepe',
      phonePeMerchantTransactionId: reserved.currentCycle.merchantOrderId,
      phonePeMerchantSubscriptionId: reserved.merchantSubscriptionId,
      orderType: 'subscription_charge',
      status: 'pending',
    });
    const result = await phonePeProvider.notifyRedemption({
      merchantOrderId: reserved.currentCycle.merchantOrderId,
      merchantSubscriptionId: reserved.merchantSubscriptionId,
      userId: reserved._id,
      cycle: reserved.currentCycle.sequence,
    });
    await billingModel.updateOne({
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
      'currentCycle.notifyFailureMessage': null,
    } });
    return result;
  } catch (error) {
    // Do not blindly retry an uncertain provider create. The order-status
    // reconciliation path determines whether PhonePe accepted the request.
    await recordNotifyFailure({ billingModel, billing: reserved, error, now, logger: dependencies.logger }).catch(() => {});
    throw error;
  }
}

async function executeDueRedemption(billing, now = new Date(), dependencies = {}) {
  const billingModel = dependencies.billingModel || PhonePeBilling;
  const phonePeProvider = dependencies.provider || provider;
  const logger = dependencies.logger || console;
  const cycle = billing.currentCycle;
  if (!cycle?.merchantOrderId || cycle.notifyState !== 'NOTIFIED' || cycle.redeemState === 'COMPLETED') return null;
  if (!cycle.validAfter || new Date(cycle.validAfter) > now) return null;
  if (billing.cancelledAt || billing.phase !== 'active') return null;
  if (cycle.validUpto && new Date(cycle.validUpto) <= now) return null;
  if (cycle.executeRetryAt && new Date(cycle.executeRetryAt) > now) return null;
  if (!await activeMandate(billing, { billingModel, provider: phonePeProvider })) return null;
  const attemptCount = Number(cycle.executeAttemptCount || 0) + 1;
  const reserved = await billingModel.findOneAndUpdate({
    _id: billing._id,
    phase: 'active',
    cancelledAt: null,
    'currentCycle.merchantOrderId': cycle.merchantOrderId,
    'currentCycle.notifyState': 'NOTIFIED',
    'currentCycle.redeemState': { $nin: ['REQUESTING', 'PENDING', 'COMPLETED'] },
  }, { $set: {
    'currentCycle.redeemState': 'REQUESTING',
    'currentCycle.executeRequestedAt': now,
    'currentCycle.executeAttemptCount': attemptCount,
    'currentCycle.executeLastAttemptAt': now,
  } }, { new: true });
  if (!reserved) return null;
  try {
    const result = await phonePeProvider.redeem(cycle.merchantOrderId);
    await billingModel.updateOne({
      _id: billing._id,
      'currentCycle.merchantOrderId': cycle.merchantOrderId,
      'currentCycle.redeemState': 'REQUESTING',
    }, { $set: {
      'currentCycle.redeemState': result.state,
      'currentCycle.phonePeTransactionId': result.transactionId,
      'currentCycle.executeRetryAt': null,
      'currentCycle.executeFailureCode': null,
      'currentCycle.executeFailureStatus': null,
      'currentCycle.executeFailureDetailedCode': null,
      'currentCycle.executeFailureMessage': null,
    } });
    return result;
  } catch (error) {
    // A timeout can still mean PhonePe accepted the debit. Keep REQUESTING,
    // persist safe diagnostics, and retry only after status reconciliation.
    await recordExecuteFailure({ billingModel, billing: reserved, error, now, logger }).catch(() => {});
    throw error;
  }
}

async function recoverOrExpireCycle(billing, now = new Date(), dependencies = {}) {
  const billingModel = dependencies.billingModel || PhonePeBilling;
  const orderModel = dependencies.orderModel || Order;
  const cycle = billing?.currentCycle;
  if (!cycle?.merchantOrderId || TERMINAL_REDEEM_STATES.has(cycle.redeemState)) return null;

  if (cycle.validUpto && new Date(cycle.validUpto) <= now
    && !['PENDING', 'COMPLETED'].includes(cycle.redeemState)) {
    const changed = await billingModel.updateOne({
      _id: billing._id,
      'currentCycle.merchantOrderId': cycle.merchantOrderId,
      'currentCycle.redeemState': { $nin: ['PENDING', 'COMPLETED', 'FAILED', 'EXPIRED'] },
    }, { $set: {
      'currentCycle.redeemState': 'EXPIRED',
      'currentCycle.failureCode': 'REDEMPTION_WINDOW_EXPIRED',
      'currentCycle.executeRetryAt': null,
    } });
    if (Number(changed?.modifiedCount || 0) > 0) {
      await orderModel.updateOne({
        phonePeMerchantTransactionId: cycle.merchantOrderId,
        status: 'pending',
      }, { $set: { status: 'failed' } });
      return { expired: true };
    }
    return null;
  }

  if (cycle.notifyState !== 'NOTIFIED' || cycle.redeemState !== 'REQUESTING') return null;
  const retryAt = cycle.executeRetryAt
    ? new Date(cycle.executeRetryAt)
    : executeRetryAt(Math.max(Number(cycle.executeAttemptCount || 0), 1), cycle.executeRequestedAt || now);
  if (retryAt > now) {
    if (!cycle.executeRetryAt) {
      await billingModel.updateOne({
        _id: billing._id,
        'currentCycle.merchantOrderId': cycle.merchantOrderId,
        'currentCycle.redeemState': 'REQUESTING',
      }, { $set: { 'currentCycle.executeRetryAt': retryAt } });
    }
    return { deferred: true, retryAt };
  }
  const changed = await billingModel.updateOne({
    _id: billing._id,
    'currentCycle.merchantOrderId': cycle.merchantOrderId,
    'currentCycle.notifyState': 'NOTIFIED',
    'currentCycle.redeemState': 'REQUESTING',
  }, { $set: { 'currentCycle.redeemState': 'RETRYABLE' } });
  return { retryable: Number(changed?.modifiedCount || 0) > 0 };
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
    && !TERMINAL_REDEEM_STATES.has(billing.currentCycle.redeemState)) {
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
    if (billing) {
      await recoverOrExpireCycle(billing, now, {
        billingModel,
        orderModel: dependencies.orderModel || Order,
      });
      billing = await billingModel.findById(billing._id);
    }
  }
  if (!billing || billing.phase !== 'active' || billing.cancelledAt) return;
  if (!billing.currentCycle || TERMINAL_REDEEM_STATES.has(billing.currentCycle.redeemState)) {
    await submitNotification(billing, now, dependencies);
    billing = await billingModel.findById(billing._id);
  }
  if (billing) await executeDueRedemption(billing, now, dependencies);
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
  executeRetryAt,
  safeProviderFailure,
  recordNotifyFailure,
  recordExecuteFailure,
  recoverOrExpireCycle,
  processBilling,
  runDueBillings,
};
