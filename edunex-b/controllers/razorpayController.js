const crypto = require('node:crypto');
const Billing = require('../models/RazorpayBilling');
const Webhook = require('../models/BillingWebhook');
const Subscription = require('../models/Subscription');
const Order = require('../models/Order');
const User = require('../models/User');
const rzp = require('../services/razorpayService');
const modes = require('../services/paymentMode');
const billingMode = billing => billing?.mode || rzp.legacyMode();
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const wrap = fn => async (req, res) => { try { await fn(req, res); } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Billing is temporarily unavailable. Please retry.' }); } };
function hasValidAccess(status, trialExpiresAt, currentPeriodEnd, now = new Date()) {
  const normalized = String(status || '').toLowerCase();
  if (['trial', '1rs trial'].includes(normalized)) return Boolean(trialExpiresAt && new Date(trialExpiresAt) > now);
  if (['active', 'subscribed'].includes(normalized)) return !currentPeriodEnd || new Date(currentPeriodEnd) > now;
  if (['cancelled', 'paused'].includes(normalized)) return Boolean(currentPeriodEnd && new Date(currentPeriodEnd) > now);
  return false;
}

async function reconcile(billing) {
  if (!billing?.subscriptionId) return null;
  const mode = billingMode(billing);
  const lease = crypto.randomUUID();
  const locked = await Billing.findOneAndUpdate({ _id: billing._id, subscriptionId: billing.subscriptionId,
    $or: [{ leaseUntil: { $lt: new Date() } }, { leaseUntil: null }] }, { $set: { lease, leaseUntil: new Date(Date.now() + 180000) } }, { new: true });
  if (!locked) throw fail('Payment verification is in progress. Please retry shortly.', 503);
  try {
    const remote = await rzp.api(`/subscriptions/${encodeURIComponent(billing.subscriptionId)}`, 'GET', undefined, billingMode(billing));
    const allInvoices = [];
    for (let skip = 0; skip < 500; skip += 100) {
      const page = await rzp.api(`/invoices?subscription_id=${encodeURIComponent(billing.subscriptionId)}&count=100&skip=${skip}`, 'GET', undefined, mode);
      allInvoices.push(...(page.items || []));
      if ((page.items || []).length < 100) break;
      if (skip === 400) throw fail('Billing history needs operator reconciliation.', 503);
    }
    const invoices = allInvoices.filter(invoice => invoice.subscription_id === billing.subscriptionId && invoice.status === 'paid' && invoice.payment_id)
      .sort((a, b) => (b.billing_end || b.paid_at || 0) - (a.billing_end || a.paid_at || 0))
      .filter(invoice => !invoice.billing_end || invoice.billing_end * 1000 > Date.now()).slice(0, 6);
    const payments = await Promise.all(invoices.map(async invoice => ({ invoice, payment: await rzp.api(`/payments/${encodeURIComponent(invoice.payment_id)}`, 'GET', undefined, mode) })));
    const state = rzp.entitlement(billing, remote, payments);
    const terminal = ['cancelled', 'completed', 'expired'].includes(remote.status);
    const subscription = await Subscription.findOneAndUpdate({ user: billing._id }, { $set: {
      gateway: 'razorpay', razorpayMode: mode, razorpaySubscriptionId: remote.id, razorpayStatus: remote.status,
      ...state, amount: billing.recurringAmount ?? (billing.paymentType === 'annual' ? billing.annualAmount : billing.monthlyAmount),
      frequency: billing.paymentType === 'annual' ? 'yearly' : 'monthly', nextBillingAt: !terminal && remote.charge_at ? new Date(remote.charge_at * 1000) : null,
      ...(terminal ? { cancelledAt: new Date((remote.ended_at || Math.floor(Date.now() / 1000)) * 1000) } : {}),
    }, $setOnInsert: { user: billing._id, phonePeMerchantId: 'razorpay' } }, { upsert: true, new: true, runValidators: true });
    for (const { payment, invoice } of payments) {
      // Keep the legacy unique transaction key populated; existing PhonePe indexes need no destructive migration.
      await Order.updateOne({ phonePeMerchantTransactionId: `razorpay:${payment.id}` }, { $set: {
        status: payment.status === 'captured' ? 'paid' : 'failed', refundedAmount: payment.amount_refunded || 0,
      }, $setOnInsert: { user: billing._id, subscription: subscription._id, gateway: 'razorpay', razorpayMode: mode, razorpayPaymentId: payment.id,
        razorpaySubscriptionId: remote.id, totalAmount: payment.amount,
        orderType: invoice.billing_start ? 'subscription_charge' : 'trial_charge', paidAt: new Date(payment.created_at * 1000) } }, { upsert: true });
    }
    const active = ['active', 'trial'].includes(state.status);
    await User.findByIdAndUpdate(billing._id, { subscriptionId: subscription._id, subscriptionStatus: state.status === 'pending' ? 'none' : state.status,
      subscriptionExpiry: active ? state.currentPeriodEnd || state.trialExpiresAt : null, isOnTrial: state.status === 'trial' });
    if (terminal) await Billing.updateOne({ _id: billing._id, lease }, { $set: { phase: 'closed' } });
    return subscription;
  } finally {
    await Billing.updateOne({ _id: billing._id, lease }, { $unset: { lease: 1, leaseUntil: 1 } });
  }
}
function checkoutResponse(billing, user) {
  return { gateway: 'razorpay', subscriptionId: billing.subscriptionId, mode: billingMode(billing), keyId: rzp.config(billingMode(billing)).keyId,
    paymentType: billing.paymentType, trialEndsAt: billing.trialEnd, prefill: { name: user.fullName || '', contact: user.mobileNumber || '', email: user.email || '' } };
}
exports.pricing = wrap(async (_req, res) => {
  const c = rzp.config(await modes.activeMode());
  res.json({ mode: c.mode, gateway: process.env.PAYMENT_GATEWAY_MODE || 'razorpay', trialAmountPaise: c.trialAmount, subscriptionAmountPaise: c.monthlyAmount, trialHours: c.trialHours, currency: 'INR', billingCycles: c.cycles,
    annualAmountPaise: c.annualAmount, annualBillingCycles: c.annualCycles, annualAvailable: process.env.PAYMENT_GATEWAY_MODE === 'razorpay' && Boolean(c.annualPlanId) });
});
exports.initiate = wrap(async (req, res) => {
  const type = req.body.paymentType || 'trial';
  if (!['trial', 'monthly', 'annual'].includes(type)) throw fail('Choose a valid subscription plan.', 400);
  const c = rzp.requireConfig(await modes.activeMode(), type);
  if (!req.user.isMobileVerified) throw fail('Verify your mobile number before subscribing.', 403);
  if (req.body.mandateConsent !== true) throw fail('Confirm the recurring payment terms before continuing.', 400);
  const existing = await Subscription.findOne({ user: req.user._id });
  if (existing && ((['active', 'subscribed'].includes(existing.status) && new Date(existing.currentPeriodEnd) > new Date()) || (['trial', '1rs trial'].includes(existing.status) && new Date(existing.trialExpiresAt) > new Date()))) throw fail('You already have paid access. Manage your existing subscription first.');
  if (existing?.phonePeMandateId && !existing.cancelledAt && existing.gateway !== 'razorpay') throw fail('Cancel the existing PhonePe mandate before changing payment providers.');
  if (type === 'trial' && (existing?.trialStartedAt || await Order.exists({ user: req.user._id, orderType: 'trial_charge', status: 'paid' }))) throw fail('You have already used the trial. Choose the monthly plan.');
  let billing = await Billing.findById(req.user._id);
  if (billing?.phase === 'ready') {
    if (billingMode(billing) !== c.mode) throw fail('An unfinished checkout exists in the previous gateway mode. Cancel it before starting a new checkout.');
    const remote = await rzp.api(`/subscriptions/${encodeURIComponent(billing.subscriptionId)}`, 'GET', undefined, billingMode(billing));
    if (remote.status === 'created' && (!remote.expire_by || remote.expire_by * 1000 > Date.now())) {
      if (billing.paymentType !== type) throw fail('An unfinished checkout exists. Cancel it before choosing another plan.');
      return res.json(checkoutResponse(billing, req.user));
    }
    if (!['cancelled', 'expired', 'completed'].includes(remote.status)) throw fail('A mandate already exists. Check subscription status before retrying.');
    await Billing.updateOne({ _id: billing._id, subscriptionId: billing.subscriptionId }, { $set: { phase: 'closed' } });
  }
  const terms = rzp.planTerms(c, type);
  const plan = await rzp.api(`/plans/${encodeURIComponent(terms.planId)}`, 'GET', undefined, c.mode);
  rzp.validatePlan(plan, c, type);
  const attempt = crypto.randomUUID();
  const payload = rzp.createPayload(c, type, attempt);
  try {
    billing = await Billing.findOneAndUpdate({ _id: req.user._id, phase: 'closed' }, { $set: { attempt, mode: c.mode, phase: 'creating', paymentType: type,
      planId: terms.planId, trialAmount: c.trialAmount, monthlyAmount: c.monthlyAmount, annualAmount: c.annualAmount, recurringAmount: terms.amount, trialEnd: payload.start_at ? new Date(payload.start_at * 1000) : null },
      $unset: { subscriptionId: 1 } }, { upsert: true, new: true });
  } catch (error) { if (error.code === 11000) throw fail('Checkout creation is already in progress or needs reconciliation. Please contact support before trying again.'); throw error; }
  try {
    const remote = await rzp.api('/subscriptions', 'POST', payload, c.mode);
    billing = await Billing.findOneAndUpdate({ _id: billing._id, attempt }, { $set: { phase: 'ready', subscriptionId: remote.id } }, { new: true });
    res.status(201).json(checkoutResponse(billing, req.user));
  } catch (error) {
    // A timeout may still create a mandate upstream. Never blindly retry creation.
    await Billing.updateOne({ _id: billing._id, attempt }, { $set: { phase: 'uncertain' } });
    throw error;
  }
});
exports.verify = wrap(async (req, res) => {
  const billing = await Billing.findById(req.user._id);
  const { razorpay_payment_id: paymentId, razorpay_subscription_id: subscriptionId, razorpay_signature: signature } = req.body;
  if (!billing?.subscriptionId || subscriptionId !== billing.subscriptionId || typeof paymentId !== 'string' || !/^pay_[a-zA-Z0-9]+$/.test(paymentId)) throw fail('Invalid checkout result.', 400);
  if (!rzp.validSignature(`${paymentId}|${billing.subscriptionId}`, signature, rzp.requireConfig(billingMode(billing), billing.paymentType).secret)) throw fail('Invalid payment signature.', 400);
  const subscription = await reconcile(billing);
  res.json({ verified: true, accessGranted: ['trial', 'active'].includes(subscription.status), status: subscription.status });
});
exports.status = wrap(async (req, res) => {
  const billing = await Billing.findById(req.user._id);
  const subscription = billing?.subscriptionId ? await reconcile(billing) : await Subscription.findOne({ user: req.user._id });
  const docValid = subscription && hasValidAccess(subscription.status, subscription.trialExpiresAt, subscription.currentPeriodEnd);
  const userValid = hasValidAccess(req.user.subscriptionStatus, req.user.subscriptionExpiry, req.user.subscriptionExpiry);
  const effectiveStatus = docValid ? subscription.status : (userValid ? req.user.subscriptionStatus : 'none');
  const valid = Boolean(docValid || userValid);
  res.json({ status: effectiveStatus, subscriptionStatus: effectiveStatus, subscriptionDocStatus: subscription?.status || 'none',
    trialExpiresAt: subscription?.trialExpiresAt, currentPeriodEnd: subscription?.currentPeriodEnd, nextBillingAt: subscription?.nextBillingAt,
    subscriptionType: subscription?.subscriptionType, frequency: subscription?.frequency, verified: valid, sameAccount: true, paid: valid,
    mandateStatus: subscription?.razorpayStatus || null, accessGranted: valid, hasActiveAccess: valid, trialEligible: !subscription?.trialStartedAt,
    subscriptionId: billing?.subscriptionId || null,
    canCancel: Boolean(billing?.subscriptionId && !['cancelled', 'expired', 'completed'].includes(subscription?.razorpayStatus)),
    pendingCheckout: billing?.phase === 'ready' });
});
exports.cancel = wrap(async (req, res) => {
  const billing = await Billing.findById(req.user._id);
  if (!billing?.subscriptionId) throw fail('No Razorpay subscription found.', 404);
  const remote = await rzp.api(`/subscriptions/${encodeURIComponent(billing.subscriptionId)}`, 'GET', undefined, billingMode(billing));
  if (!['cancelled', 'expired', 'completed'].includes(remote.status)) await rzp.api(`/subscriptions/${encodeURIComponent(billing.subscriptionId)}/cancel`, 'POST', { cancel_at_cycle_end: 0 }, billingMode(billing));
  await reconcile(billing);
  res.json({ message: 'Auto-renewal cancelled. Any paid access remains available until its expiry.' });
});
exports.webhook = wrap(async (req, res) => {
  const signedModes = Buffer.isBuffer(req.body) ? ['test', 'live'].filter(mode => rzp.validSignature(req.body, req.get('x-razorpay-signature'), rzp.config(mode).webhookSecret)) : [];
  if (signedModes.length !== 1) throw fail('Invalid or ambiguous webhook signature. Use different webhook secrets for test and live.', 400);
  const mode = signedModes[0];
  const payload = JSON.parse(req.body.toString('utf8'));
  const eventId = `${mode}:${req.get('x-razorpay-event-id') || crypto.createHash('sha256').update(req.body).digest('hex')}`;
  if ((await Webhook.findById(eventId))?.processedAt) return res.json({ ok: true });
  let subscriptionId = payload.payload?.subscription?.entity?.id || payload.payload?.invoice?.entity?.subscription_id;
  const paymentId = payload.payload?.payment?.entity?.id || payload.payload?.refund?.entity?.payment_id;
  if (!subscriptionId && paymentId) {
    const order = await Order.findOne({ razorpayPaymentId: paymentId });
    subscriptionId = order?.razorpaySubscriptionId;
    if (!subscriptionId) {
      const payment = await rzp.api(`/payments/${encodeURIComponent(paymentId)}`, 'GET', undefined, mode);
      if (payment.invoice_id) subscriptionId = (await rzp.api(`/invoices/${encodeURIComponent(payment.invoice_id)}`, 'GET', undefined, mode)).subscription_id;
    }
  }
  let billing = subscriptionId ? await Billing.findOne({ subscriptionId }) : null;
  // Recover an upstream create that succeeded before a local timeout or process crash.
  const attempt = payload.payload?.subscription?.entity?.notes?.checkout_attempt;
  if (!billing && subscriptionId && attempt) billing = await Billing.findOneAndUpdate({ attempt, ...(mode === rzp.legacyMode() ? { $or: [{ mode }, { mode: { $exists: false } }] } : { mode }), phase: { $in: ['creating', 'uncertain'] } }, { $set: { phase: 'ready', subscriptionId } }, { new: true });
  if (billing && billingMode(billing) !== mode) throw fail('Webhook mode does not match the subscription.', 400);
  if (billing) await reconcile(billing);
  await Webhook.updateOne({ _id: eventId }, { $set: { event: payload.event, processedAt: new Date() } }, { upsert: true });
  res.json({ ok: true });
});
exports.reconcile = reconcile;
