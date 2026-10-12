const crypto = require('node:crypto');
const PhonePeBilling = require('../models/PhonePeAutoPayBilling');
const RazorpayBilling = require('../models/RazorpayBilling');
const Subscription = require('../models/Subscription');
const SubscriptionEvent = require('../models/SubscriptionEvent');
const Order = require('../models/Order');
const service = require('../services/phonePeStandardAutoPayService');
const claims = require('../services/phonePeEventClaims');
const { hasUsedIntroTrial } = require('../services/trialEligibility');
const { loadAccountEntitlement } = require('../services/accountEntitlement');
const { resolveSubscriptionAccess } = require('../services/subscriptionAccess');
const { syncUserSubscriptionMirror } = require('../services/subscriptionMirror');
const { activeCourseEntitlements } = require('../services/courseAccess');

const TERMINAL_BILLING_PHASES = new Set(['cancelled', 'failed']);
const TERMINAL_PROVIDER_STATES = new Set(['FAILED', 'EXPIRED', 'CANCELLED', 'REVOKED']);

function fail(message, status = 409) {
  return Object.assign(new Error(message), { statusCode: status, status });
}

function generatedId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(7).toString('hex')}`.toUpperCase();
}

function addHours(value, hours) {
  return new Date(new Date(value).getTime() + hours * 60 * 60 * 1000);
}

function addMonth(value) {
  const result = new Date(value);
  result.setMonth(result.getMonth() + 1);
  return result;
}

function redirectUrl(config, merchantOrderId) {
  const result = new URL(config.redirectUrl);
  result.searchParams.set('merchantTransactionId', merchantOrderId);
  result.searchParams.set('payment', 'return');
  return result.toString();
}

function paymentInstrument(value) {
  const normalized = String(value || '').toUpperCase();
  if (normalized.startsWith('UPI')) return 'UPI';
  if (normalized.includes('CARD')) return 'CARD';
  if (normalized.includes('NET')) return 'NETBANKING';
  if (normalized.includes('WALLET')) return 'WALLET';
  return null;
}

async function recordEvent({ subscription, user, event, amount = null, transactionId, merchantOrderId, metadata = {} }) {
  const uniqueTransaction = String(transactionId || `${merchantOrderId}:${event}`).slice(0, 200);
  await SubscriptionEvent.updateOne(
    { phonePeTransactionId: uniqueTransaction },
    { $setOnInsert: {
      subscription,
      user,
      event,
      amount,
      phonePeTransactionId: uniqueTransaction,
      phonePeMerchantTransactionId: merchantOrderId || null,
      metadata,
      createdAt: new Date(),
    } },
    { upsert: true }
  );
}

function validateMandateTerms(status, billing) {
  if (status.merchantSubscriptionId && status.merchantSubscriptionId !== billing.merchantSubscriptionId) {
    throw fail('PhonePe returned a different subscription identifier.', 502);
  }
  if (status.maxAmount !== service.MONTHLY_AMOUNT_PAISE
    || status.amountType !== 'FIXED'
    || status.frequency !== 'MONTHLY') {
    throw fail('PhonePe mandate terms do not match the ₹499 monthly subscription.', 502);
  }
}

async function applySetupCompletion(billing, orderStatus, mandateStatus, now = new Date()) {
  if (Number(orderStatus.amount) !== Number(billing.setupAmount)) {
    throw fail('PhonePe setup payment amount did not match the checkout.', 502);
  }
  validateMandateTerms(mandateStatus, billing);
  const setupOrder = await Order.findOne({
    phonePeMerchantTransactionId: billing.setupMerchantOrderId,
    gateway: 'phonepe',
    orderType: 'mandate_setup',
  });
  if (!setupOrder) throw fail('The local PhonePe setup order is missing.', 502);

  setupOrder.status = 'paid';
  setupOrder.paidAt = setupOrder.paidAt || now;
  setupOrder.phonePeTransactionId = orderStatus.transactionId || setupOrder.phonePeTransactionId;
  setupOrder.phonePePaymentInstrument = paymentInstrument(orderStatus.paymentMode) || setupOrder.phonePePaymentInstrument;
  setupOrder.phonePeMerchantSubscriptionId = billing.merchantSubscriptionId;
  await setupOrder.save();

  const trial = billing.paymentType === 'trial';
  const periodStart = setupOrder.paidAt || now;
  const trialEndsAt = trial ? addHours(periodStart, service.TRIAL_HOURS) : null;
  const currentPeriodEnd = trial ? null : addMonth(periodStart);
  const subscription = await Subscription.findOneAndUpdate(
    { user: billing._id },
    {
      $setOnInsert: {
        user: billing._id,
        phonePeMerchantId: service.config().merchantId,
        createdAt: periodStart,
      },
      $set: {
        gateway: 'phonepe',
        phonePeSubscriptionId: billing.merchantSubscriptionId,
        phonePeMandateId: mandateStatus.subscriptionId,
        phonePeStatus: mandateStatus.state,
        status: trial ? '1rs trial' : 'subscribed',
        subscriptionType: trial ? 'trial' : 'monthly',
        frequency: 'monthly',
        amount: service.MONTHLY_AMOUNT_PAISE,
        trialStartedAt: trial ? periodStart : null,
        trialExpiresAt: trialEndsAt,
        currentPeriodStart: trial ? null : periodStart,
        currentPeriodEnd,
        nextBillingAt: trialEndsAt || currentPeriodEnd,
        cancelledAt: null,
      },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  setupOrder.subscription = subscription._id;
  await setupOrder.save();
  await PhonePeBilling.updateOne({ _id: billing._id, attempt: billing.attempt }, { $set: {
    phase: 'active',
    providerState: mandateStatus.state,
    phonePeSubscriptionId: mandateStatus.subscriptionId,
    trialStartedAt: trial ? periodStart : null,
    trialEndsAt,
    nextBillingAt: trialEndsAt || currentPeriodEnd,
  } });
  await recordEvent({
    subscription: subscription._id,
    user: billing._id,
    event: 'MANDATE_APPROVED',
    transactionId: `${orderStatus.transactionId || billing.setupMerchantOrderId}:MANDATE`,
    merchantOrderId: billing.setupMerchantOrderId,
    metadata: { providerState: mandateStatus.state },
  });
  await recordEvent({
    subscription: subscription._id,
    user: billing._id,
    event: 'PAYMENT_SUCCESS',
    amount: billing.setupAmount,
    transactionId: orderStatus.transactionId || billing.setupMerchantOrderId,
    merchantOrderId: billing.setupMerchantOrderId,
    metadata: { paymentType: billing.paymentType },
  });
  await syncUserSubscriptionMirror(billing._id);
  return subscription;
}

async function reconcileSetup(billing) {
  if (!billing?.setupMerchantOrderId) return null;
  const status = await service.getOrderStatus(billing.setupMerchantOrderId);
  await PhonePeBilling.updateOne({ _id: billing._id }, { $set: {
    providerState: status.state,
    phonePeOrderId: status.orderId || billing.phonePeOrderId,
  } });
  if (status.state === 'PENDING') return null;
  if (TERMINAL_PROVIDER_STATES.has(status.state)) {
    await Promise.all([
      PhonePeBilling.updateOne({ _id: billing._id }, { $set: { phase: 'failed', providerState: status.state } }),
      Order.updateOne({ phonePeMerchantTransactionId: billing.setupMerchantOrderId, status: 'pending' }, { $set: { status: 'failed' } }),
    ]);
    return null;
  }
  if (status.state !== 'COMPLETED') return null;
  const mandate = await service.getSubscriptionStatus(billing.merchantSubscriptionId);
  if (mandate.state !== 'ACTIVE') {
    await PhonePeBilling.updateOne({ _id: billing._id }, { $set: {
      providerState: mandate.state,
      phonePeSubscriptionId: mandate.subscriptionId || billing.phonePeSubscriptionId,
    } });
    return null;
  }
  return applySetupCompletion(billing, status, mandate);
}

async function completeRedemption(billing, orderStatus, now = new Date()) {
  const cycle = billing.currentCycle;
  if (!cycle?.merchantOrderId) throw fail('PhonePe renewal cycle is missing.', 502);
  if (Number(orderStatus.amount) !== service.MONTHLY_AMOUNT_PAISE) {
    throw fail('PhonePe renewal amount did not match ₹499.', 502);
  }
  if (orderStatus.merchantSubscriptionId && orderStatus.merchantSubscriptionId !== billing.merchantSubscriptionId) {
    throw fail('PhonePe renewal belongs to a different subscription.', 502);
  }
  const order = await Order.findOne({ phonePeMerchantTransactionId: cycle.merchantOrderId, orderType: 'subscription_charge' });
  if (!order) throw fail('The local PhonePe renewal order is missing.', 502);
  order.status = 'paid';
  order.paidAt = order.paidAt || now;
  order.phonePeTransactionId = orderStatus.transactionId || order.phonePeTransactionId;
  order.phonePePaymentInstrument = paymentInstrument(orderStatus.paymentMode) || order.phonePePaymentInstrument;
  await order.save();

  let subscription = await Subscription.findOne({ user: billing._id });
  if (!subscription) throw fail('The PhonePe subscription record is missing.', 502);
  if (subscription.phonePeLastRedemptionOrderId !== cycle.merchantOrderId) {
    const existingEnd = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;
    const trialEnd = subscription.trialExpiresAt ? new Date(subscription.trialExpiresAt) : null;
    const futureAnchor = [existingEnd, trialEnd]
      .filter(date => Number.isFinite(date?.getTime()) && date > now)
      .sort((a, b) => b - a)[0];
    const periodStart = futureAnchor || now;
    const periodEnd = addMonth(periodStart);
    subscription = await Subscription.findOneAndUpdate({ _id: subscription._id }, { $set: {
      gateway: 'phonepe',
      phonePeStatus: 'ACTIVE',
      phonePeLastRedemptionOrderId: cycle.merchantOrderId,
      status: 'subscribed',
      subscriptionType: 'monthly',
      trialConverted: true,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      nextBillingAt: periodEnd,
      amount: service.MONTHLY_AMOUNT_PAISE,
    } }, { new: true, runValidators: true });
    order.subscription = subscription._id;
    await order.save();
    await PhonePeBilling.updateOne({ _id: billing._id, 'currentCycle.merchantOrderId': cycle.merchantOrderId }, { $set: {
      phase: 'active',
      providerState: 'ACTIVE',
      nextBillingAt: periodEnd,
      lastCompletedMerchantOrderId: cycle.merchantOrderId,
      'currentCycle.redeemState': 'COMPLETED',
      'currentCycle.phonePeTransactionId': orderStatus.transactionId || cycle.phonePeTransactionId,
      'currentCycle.completedAt': order.paidAt,
    } });
    await recordEvent({
      subscription: subscription._id,
      user: billing._id,
      event: 'PAYMENT_SUCCESS',
      amount: service.MONTHLY_AMOUNT_PAISE,
      transactionId: orderStatus.transactionId || cycle.merchantOrderId,
      merchantOrderId: cycle.merchantOrderId,
      metadata: { cycle: cycle.sequence },
    });
    await syncUserSubscriptionMirror(billing._id);
  }
  return subscription;
}

async function reconcileCycle(billing) {
  const cycle = billing?.currentCycle;
  if (!cycle?.merchantOrderId) return null;
  const status = await service.getOrderStatus(cycle.merchantOrderId);
  const update = {
    'currentCycle.phonePeOrderId': status.orderId || cycle.phonePeOrderId,
  };
  if (status.validAfter) update['currentCycle.validAfter'] = new Date(status.validAfter);
  if (status.validUpto) update['currentCycle.validUpto'] = new Date(status.validUpto);
  if (status.notifiedAt) update['currentCycle.notifiedAt'] = new Date(status.notifiedAt);
  if (['NOTIFICATION_IN_PROGRESS', 'NOTIFIED'].includes(status.state)) {
    update['currentCycle.notifyState'] = status.state;
  } else if (status.state === 'PENDING') {
    update['currentCycle.redeemState'] = 'PENDING';
  } else if (status.state === 'COMPLETED') {
    await PhonePeBilling.updateOne({ _id: billing._id }, { $set: update });
    return completeRedemption(billing, status);
  } else if (status.state === 'FAILED') {
    update['currentCycle.redeemState'] = 'FAILED';
    update['currentCycle.failureCode'] = 'PHONEPE_REDEMPTION_FAILED';
    await Order.updateOne({ phonePeMerchantTransactionId: cycle.merchantOrderId, status: 'pending' }, { $set: { status: 'failed' } });
  }
  await PhonePeBilling.updateOne({ _id: billing._id }, { $set: update });
  return null;
}

async function initiate(req, res) {
  try {
    const paymentType = String(req.body?.paymentType || '').toLowerCase();
    if (!['trial', 'monthly'].includes(paymentType)) return res.status(400).json({ error: 'Choose the trial or monthly plan.' });
    if (req.body?.mandateConsent !== true) return res.status(400).json({ error: 'Confirm the recurring payment terms before continuing.' });
    if (!req.onboarding && !req.user?.isMobileVerified) return res.status(403).json({ error: 'Verify your mobile number before subscribing.' });
    const c = service.requireConfigured();
    const [existingSubscription, account, razorpayBilling] = await Promise.all([
      Subscription.findOne({ user: req.user._id }),
      loadAccountEntitlement(req.user),
      RazorpayBilling.findById(req.user._id),
    ]);
    if (account.access.active) return res.status(409).json({ error: 'Premium access is already active.' });
    if (existingSubscription?.gateway === 'razorpay'
      && existingSubscription.razorpaySubscriptionId
      && !['cancelled', 'expired', 'completed', 'halted'].includes(String(existingSubscription.razorpayStatus || '').toLowerCase())) {
      return res.status(409).json({ error: 'Cancel the existing Razorpay mandate before switching payment providers.' });
    }
    if (razorpayBilling?.phase === 'ready'
      && razorpayBilling.subscriptionId
      && existingSubscription?.gateway !== 'phonepe') {
      return res.status(409).json({ error: 'An existing Razorpay checkout must be cancelled before starting PhonePe AutoPay.' });
    }
    const trialUsed = await hasUsedIntroTrial(req.user._id, existingSubscription, req.user);
    if (paymentType === 'trial' && trialUsed) return res.status(409).json({ error: 'The ₹1 trial can only be used once per account. Continue with ₹499 monthly access.' });

    const existing = await PhonePeBilling.findById(req.user._id);
    if (existing?.phase === 'setup_pending' && existing.approvalUrl) {
      if (existing.paymentType !== paymentType) return res.status(409).json({ error: 'An unfinished PhonePe checkout already exists.' });
      return res.json({
        gateway: 'phonepe',
        redirectUrl: existing.approvalUrl,
        merchantTransactionId: existing.setupMerchantOrderId,
        paymentType,
      });
    }
    if (existing && !TERMINAL_BILLING_PHASES.has(existing.phase)) {
      return res.status(409).json({ error: 'PhonePe subscription setup is already active or awaiting confirmation.' });
    }

    const attempt = crypto.randomUUID();
    const merchantOrderId = generatedId('PPS');
    const merchantSubscriptionId = generatedId('PPA');
    const setupAmount = paymentType === 'trial' ? service.SETUP_AMOUNT_PAISE : service.MONTHLY_AMOUNT_PAISE;
    let billing;
    if (existing) {
      billing = await PhonePeBilling.findOneAndUpdate(
        { _id: req.user._id, phase: { $in: [...TERMINAL_BILLING_PHASES] } },
        {
          $set: {
            phase: 'creating', mode: c.mode, paymentType, attempt, merchantSubscriptionId,
            setupMerchantOrderId: merchantOrderId, setupAmount, recurringAmount: service.MONTHLY_AMOUNT_PAISE,
            providerState: null, phonePeOrderId: null, phonePeSubscriptionId: null, approvalUrl: null,
            trialStartedAt: null, trialEndsAt: null, nextBillingAt: null, currentCycle: null,
            cancelledAt: null, cancelRequestedAt: null, lastCompletedMerchantOrderId: null,
          },
        },
        { new: true, runValidators: true }
      );
    } else {
      try {
        billing = await PhonePeBilling.create({
          _id: req.user._id, phase: 'creating', mode: c.mode, paymentType, attempt,
          merchantSubscriptionId, setupMerchantOrderId: merchantOrderId,
          setupAmount, recurringAmount: service.MONTHLY_AMOUNT_PAISE,
        });
      } catch (error) {
        if (error.code === 11000) return res.status(409).json({ error: 'PhonePe checkout creation is already in progress.' });
        throw error;
      }
    }
    if (!billing) return res.status(409).json({ error: 'PhonePe checkout state changed. Refresh before retrying.' });
    await Order.create({
      user: req.user._id,
      totalAmount: setupAmount,
      gateway: 'phonepe',
      phonePeMerchantTransactionId: merchantOrderId,
      phonePeMerchantSubscriptionId: merchantSubscriptionId,
      orderType: 'mandate_setup',
      status: 'pending',
    });
    try {
      const result = await service.createSubscription({
        merchantOrderId,
        merchantSubscriptionId,
        userId: req.user._id,
        paymentType,
        redirectUrl: redirectUrl(c, merchantOrderId),
      });
      billing = await PhonePeBilling.findOneAndUpdate({ _id: req.user._id, attempt }, { $set: {
        phase: 'setup_pending',
        providerState: result.state,
        phonePeOrderId: result.orderId,
        approvalUrl: result.redirectUrl,
      } }, { new: true });
      return res.status(201).json({
        gateway: 'phonepe',
        redirectUrl: billing.approvalUrl,
        merchantTransactionId: billing.setupMerchantOrderId,
        paymentType,
      });
    } catch (error) {
      await PhonePeBilling.updateOne({ _id: req.user._id, attempt }, { $set: { phase: 'uncertain' } });
      throw error;
    }
  } catch (error) {
    return res.status(error.statusCode || error.status || 500).json({ error: error.statusCode || error.status ? error.message : 'PhonePe checkout is temporarily unavailable.' });
  }
}

async function status(req, res) {
  try {
    let billing = await PhonePeBilling.findById(req.user._id);
    if (billing?.phase === 'setup_pending') {
      try { await reconcileSetup(billing); }
      catch { /* Webhook or a later status check will retry provider reconciliation. */ }
      billing = await PhonePeBilling.findById(req.user._id);
    } else if (billing?.phase === 'active' && billing.currentCycle?.merchantOrderId
      && billing.currentCycle?.redeemState !== 'COMPLETED') {
      try { await reconcileCycle(billing); }
      catch { /* Preserve access state while PhonePe is temporarily unavailable. */ }
      billing = await PhonePeBilling.findById(req.user._id);
    }
    const [account, subscription] = await Promise.all([
      loadAccountEntitlement(req.user),
      Subscription.findOne({ user: req.user._id }),
    ]);
    const courseEntitlements = activeCourseEntitlements(req.user);
    const trialUsed = await hasUsedIntroTrial(req.user._id, subscription, req.user);
    const access = account.access;
    return res.json({
      status: access.status,
      subscriptionStatus: access.status,
      subscriptionDocStatus: subscription?.status || 'none',
      accessGranted: access.active,
      hasActiveAccess: access.active,
      entitlementState: access.entitlementState || (access.active ? 'ACTIVE' : 'NONE'),
      entitlementSource: access.source || 'none',
      subscriptionExpiry: access.expiresAt || null,
      trialExpiresAt: subscription?.trialExpiresAt || null,
      currentPeriodEnd: subscription?.currentPeriodEnd || null,
      nextBillingAt: billing?.nextBillingAt || subscription?.nextBillingAt || null,
      trialUsed,
      trialEligible: !trialUsed,
      subscriptionType: subscription?.subscriptionType || null,
      billingType: billing ? 'recurring' : null,
      mandateStatus: billing?.providerState || subscription?.phonePeStatus || null,
      autoRenewEnabled: Boolean(billing?.phase === 'active' && !billing.cancelledAt),
      pendingCheckout: Boolean(['creating', 'setup_pending', 'uncertain'].includes(billing?.phase)),
      hasCourseAccess: courseEntitlements.length > 0,
      courseIds: courseEntitlements.map(item => item.courseId),
      courseEntitlements,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Subscription status is temporarily unavailable.' });
  }
}

async function cancel(req, res) {
  try {
    const billing = await PhonePeBilling.findById(req.user._id);
    if (!billing?.merchantSubscriptionId || !['active', 'cancel_pending'].includes(billing.phase)) {
      return res.status(404).json({ error: 'No active PhonePe AutoPay subscription found.' });
    }
    if (billing.phase === 'active') {
      await PhonePeBilling.updateOne({ _id: billing._id, phase: 'active' }, { $set: { phase: 'cancel_pending', cancelRequestedAt: new Date() } });
      await service.cancel(billing.merchantSubscriptionId);
    }
    const now = new Date();
    await PhonePeBilling.updateOne({ _id: billing._id }, { $set: { phase: 'cancelled', providerState: 'CANCELLED', cancelledAt: now } });
    const subscription = await Subscription.findOneAndUpdate({ user: billing._id }, { $set: {
      cancelledAt: now,
      cancelReason: 'user',
      phonePeStatus: 'CANCELLED',
    } }, { new: true });
    if (subscription) {
      const remaining = resolveSubscriptionAccess(subscription, req.user);
      await recordEvent({
        subscription: subscription._id,
        user: billing._id,
        event: 'SUBSCRIPTION_CANCELLED',
        transactionId: `${billing.merchantSubscriptionId}:CANCELLED`,
        merchantOrderId: billing.setupMerchantOrderId,
        metadata: { source: 'user' },
      });
      await syncUserSubscriptionMirror(billing._id);
      return res.json({ success: true, accessUntil: remaining.expiresAt || null });
    }
    return res.json({ success: true, accessUntil: null });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'PhonePe cancellation could not be completed.' });
  }
}

async function verifyAccess(req, res) {
  const merchantOrderId = String(req.query?.merchantTransactionId || req.body?.merchantTransactionId || '');
  if (merchantOrderId) {
    const billing = await PhonePeBilling.findOne({ _id: req.user._id, setupMerchantOrderId: merchantOrderId });
    if (!billing) return res.status(404).json({ error: 'PhonePe checkout was not found for this account.' });
  }
  return status(req, res);
}

async function applyWebhook(payload) {
  const event = String(payload?.event || '').toLowerCase();
  const data = payload?.payload || payload?.data || payload || {};
  const flow = data.paymentFlow || {};
  const merchantOrderId = data.merchantOrderId || null;
  const merchantSubscriptionId = flow.merchantSubscriptionId || data.merchantSubscriptionId || null;
  let billing = merchantOrderId
    ? await PhonePeBilling.findOne({ $or: [{ setupMerchantOrderId: merchantOrderId }, { 'currentCycle.merchantOrderId': merchantOrderId }] })
    : null;
  if (!billing && merchantSubscriptionId) billing = await PhonePeBilling.findOne({ merchantSubscriptionId });
  if (!billing) return { matched: false };

  if (event === 'checkout.order.completed') await reconcileSetup(billing);
  else if (event === 'checkout.order.failed') {
    await Promise.all([
      PhonePeBilling.updateOne({ _id: billing._id }, { $set: { phase: 'failed', providerState: 'FAILED' } }),
      Order.updateOne({ phonePeMerchantTransactionId: billing.setupMerchantOrderId, status: 'pending' }, { $set: { status: 'failed' } }),
    ]);
  } else if (event === 'subscription.notification.completed') {
    await PhonePeBilling.updateOne({ _id: billing._id, 'currentCycle.merchantOrderId': merchantOrderId }, { $set: {
      'currentCycle.notifyState': 'NOTIFIED',
      'currentCycle.notifiedAt': data.timestamp ? new Date(Number(data.timestamp)) : new Date(),
      ...(flow.validAfter ? { 'currentCycle.validAfter': new Date(Number(flow.validAfter)) } : {}),
      ...(flow.validUpto ? { 'currentCycle.validUpto': new Date(Number(flow.validUpto)) } : {}),
    } });
  } else if (event === 'subscription.notification.failed') {
    await PhonePeBilling.updateOne({ _id: billing._id }, { $set: { 'currentCycle.notifyState': 'FAILED' } });
  } else if (event.startsWith('subscription.redemption.')) {
    await reconcileCycle(billing);
  } else if (['subscription.cancelled', 'subscription.revoked'].includes(event)) {
    const now = new Date();
    await PhonePeBilling.updateOne({ _id: billing._id }, { $set: { phase: 'cancelled', providerState: event.endsWith('revoked') ? 'REVOKED' : 'CANCELLED', cancelledAt: now } });
    await Subscription.updateOne({ user: billing._id }, { $set: { phonePeStatus: event.endsWith('revoked') ? 'REVOKED' : 'CANCELLED', cancelledAt: now } });
    await syncUserSubscriptionMirror(billing._id);
  } else if (event === 'subscription.paused') {
    await PhonePeBilling.updateOne({ _id: billing._id }, { $set: { providerState: 'PAUSED' } });
    await Subscription.updateOne({ user: billing._id }, { $set: { phonePeStatus: 'PAUSED', status: 'paused' } });
    await syncUserSubscriptionMirror(billing._id);
  } else if (event === 'subscription.unpaused') {
    await PhonePeBilling.updateOne({ _id: billing._id }, { $set: { phase: 'active', providerState: 'ACTIVE' } });
    await Subscription.updateOne({ user: billing._id }, { $set: { phonePeStatus: 'ACTIVE' } });
    await syncUserSubscriptionMirror(billing._id);
  }
  return { matched: true };
}

async function webhook(req, res) {
  const verification = service.verifyWebhook(req.body, req.headers);
  if (!verification.valid) return res.status(401).json({ error: 'Invalid PhonePe webhook.' });
  const payload = verification.payload;
  const data = payload?.payload || payload?.data || payload || {};
  const flow = data.paymentFlow || {};
  const event = String(payload?.event || '').toLowerCase();
  const eventKey = claims.webhookEventIdentity({
    event,
    merchantTransactionId: data.merchantOrderId,
    phonePeTransactionId: data.paymentDetails?.[0]?.transactionId || data.transactionId,
    merchantSubscriptionId: flow.merchantSubscriptionId || data.merchantSubscriptionId,
  });
  if (!eventKey) return res.status(400).json({ error: 'PhonePe event identity is required.' });
  const claim = await claims.claimPhonePeEvent({ eventKey, source: 'webhook', eventType: event });
  if (!claim.acquired) return res.sendStatus(200);
  try {
    await applyWebhook(payload);
    await claims.markPhonePeEventProcessed(claim);
    return res.sendStatus(200);
  } catch {
    await claims.markPhonePeEventFailed(claim, 'standard_autopay_processing_failed').catch(() => {});
    return res.status(503).json({ error: 'PhonePe webhook processing is temporarily unavailable.' });
  }
}

async function reconcileForUser(userId) {
  let billing = await PhonePeBilling.findById(userId);
  if (billing?.phase === 'setup_pending') {
    await reconcileSetup(billing);
    billing = await PhonePeBilling.findById(userId);
  }
  if (billing?.phase === 'active' && billing.currentCycle?.merchantOrderId
    && billing.currentCycle?.redeemState !== 'COMPLETED') {
    await reconcileCycle(billing);
  }
  return Subscription.findOne({ user: userId });
}

function pricing(_req, res) {
  const ready = service.readiness();
  if (!ready.configured) return res.status(503).json({ error: 'PhonePe Standard AutoPay checkout is unavailable.' });
  return res.json({
    gateway: 'phonepe',
    currency: 'INR',
    trialAmountPaise: service.SETUP_AMOUNT_PAISE,
    subscriptionAmountPaise: service.MONTHLY_AMOUNT_PAISE,
    trialHours: service.TRIAL_HOURS,
    autoRenewEnabled: true,
  });
}

module.exports = {
  initiate,
  status,
  cancel,
  verifyAccess,
  webhook,
  pricing,
  reconcileForUser,
  reconcileSetup,
  reconcileCycle,
  completeRedemption,
  applyWebhook,
};
