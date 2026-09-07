const Order = require('../models/Order');
const Subscription = require('../models/Subscription');
const SubscriptionEvent = require('../models/SubscriptionEvent');
const User = require('../models/User');
const phonePeService = require('../services/phonePeService');

const isProduction = process.env.NODE_ENV === 'production';
const paymentGatewayMode = String(process.env.PAYMENT_GATEWAY_MODE || 'phonepe').trim().toLowerCase();
const merchantId = process.env.PHONEPE_MERCHANT_ID || process.env.PHONEPE_CLIENT_ID || 'your_merchant_id';
const trialAmountPaise = Number(process.env.TRIAL_AMOUNT_PAISE || 100);
const subscriptionAmountPaise = Number(process.env.SUBSCRIPTION_AMOUNT_PAISE || 50000);
const frontendOrigin = (process.env.FRONTEND_ORIGIN || '').replace(/\/$/, '');
const frontendDashboardUrl = process.env.FRONTEND_DASHBOARD_URL || (frontendOrigin ? `${frontendOrigin}/courses.html` : '/courses.html');
const frontendPaymentSuccessUrl = process.env.FRONTEND_PAYMENT_SUCCESS_URL || (frontendOrigin ? `${frontendOrigin}/payment.html?payment=success` : '/payment.html?payment=success');
const frontendPaymentFailedUrl = process.env.FRONTEND_PAYMENT_FAILED_URL || (frontendOrigin ? `${frontendOrigin}/payment.html?status=failed` : '/payment.html?status=failed');
const simulatedPaymentModes = ['simulated', 'simulation', 'mock', 'local'];

function isSimulatedPaymentEnabled() {
  return !isProduction && simulatedPaymentModes.includes(paymentGatewayMode);
}

function withQueryParams(url, params = {}) {
  const baseUrl = frontendOrigin && url.startsWith('/')
    ? `${frontendOrigin}${url}`
    : url;
  const parsed = new URL(baseUrl, frontendOrigin || 'http://localhost');

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      parsed.searchParams.set(key, String(value));
    }
  });

  if (!frontendOrigin && url.startsWith('/')) {
    return `${parsed.pathname}${parsed.search}`;
  }

  return parsed.toString();
}

function requestOrigin(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'http';
  const host = forwardedHost || req.get('host');

  return host ? `${protocol}://${host}` : '';
}

function simulatedCheckoutUrl(req, merchantTransactionId) {
  const configuredBase = String(process.env.PAYMENT_SIMULATOR_BASE_URL || '').replace(/\/+$/, '');
  const base = configuredBase || requestOrigin(req);
  const path = `/api/payment/simulate?merchantTransactionId=${encodeURIComponent(merchantTransactionId)}`;
  return base ? `${base}${path}` : path;
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function normalizePaymentInstrument(instrument) {
  const type = typeof instrument === 'string'
    ? instrument
    : instrument?.type || instrument?.paymentInstrumentType || null;
  return ['UPI', 'CARD', 'NETBANKING', 'WALLET'].includes(type) ? type : null;
}

function extractWebhookPayload(req) {
  if (Buffer.isBuffer(req.body)) {
    return JSON.parse(req.body.toString('utf8') || '{}');
  }

  return req.body || {};
}

function getWebhookData(payload) {
  return payload.data || payload.response || payload;
}

function getEventName(payload) {
  return payload.event || payload.eventType || payload.type || getWebhookData(payload).event || getWebhookData(payload).eventType;
}

function extractPhonePeCustomerId(data = {}) {
  return data.subscriptionId
    || data.customerId
    || data.phonePeCustomerId
    || data.merchantUserId
    || data.recurringToken
    || data.token
    || null;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function promoteTrialToSubscribedIfEligible(subscription, userId) {
  const now = new Date();
  const trialExpired = subscription.trialExpiresAt && now >= subscription.trialExpiresAt;
  const hasMandate = Boolean(subscription.phonePeMandateId);
  const inTrial = subscription.status === '1rs trial' || subscription.status === 'trial';

  if (!inTrial || !hasMandate || !trialExpired) {
    return false;
  }

  const start = subscription.currentPeriodStart || now;
  const end = subscription.currentPeriodEnd || addMonths(start, 1);
  subscription.status = 'subscribed';
  subscription.trialConverted = true;
  subscription.currentPeriodStart = start;
  subscription.currentPeriodEnd = end;
  subscription.nextBillingAt = subscription.nextBillingAt || end;
  await subscription.save();

  await User.findByIdAndUpdate(userId, {
    subscriptionStatus: 'subscribed',
    subscriptionId: subscription._id,
  });

  return true;
}

async function createSubscriptionEventOnce({
  subscription,
  user,
  event,
  amount = null,
  phonePeTransactionId = null,
  phonePeMerchantTransactionId = null,
  metadata = {},
}) {
  if (phonePeTransactionId) {
    const existing = await SubscriptionEvent.findOne({ phonePeTransactionId, event });
    if (existing) {
      return existing;
    }
  }

  return SubscriptionEvent.create({
    subscription,
    user,
    event,
    amount,
    phonePeTransactionId,
    phonePeMerchantTransactionId,
    metadata,
  });
}

async function createTrialSubscription({ userId, order, mandateId, metadata }) {
  const now = new Date();
  const trialExpiresAt = addHours(now, 24);
  const subscription = await Subscription.findOneAndUpdate(
    { user: userId },
    {
      $setOnInsert: {
        user: userId,
        phonePeMerchantId: merchantId,
        createdAt: now,
      },
      $set: {
        status: '1rs trial',
        subscriptionType: 'trial',
        trialStartedAt: now,
        trialExpiresAt,
        phonePeMandateId: mandateId || null,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  await Order.findByIdAndUpdate(order._id, { subscription: subscription._id });
  await User.findByIdAndUpdate(userId, {
    subscriptionStatus: '1rs trial',
    subscriptionId: subscription._id,
  });
  await createSubscriptionEventOnce({
    subscription: subscription._id,
    user: userId,
    event: 'MANDATE_APPROVED',
    phonePeTransactionId: order.phonePeTransactionId ? `${order.phonePeTransactionId}:MANDATE_APPROVED` : null,
    phonePeMerchantTransactionId: order.phonePeMerchantTransactionId,
    metadata,
  });
  await createSubscriptionEventOnce({
    subscription: subscription._id,
    user: userId,
    event: 'PAYMENT_SUCCESS',
    amount: order.totalAmount,
    phonePeTransactionId: order.phonePeTransactionId,
    phonePeMerchantTransactionId: order.phonePeMerchantTransactionId,
    metadata,
  });

  return subscription;
}

async function applySuccessfulPayment(order, status) {
  order.status = 'paid';
  order.paidAt = order.paidAt || new Date();
  order.phonePeTransactionId = status.transactionId;
  order.phonePePaymentInstrument = status.paymentInstrument;
  order.phonePeCustomerId = extractPhonePeCustomerId(status.raw?.data || status.raw) || order.phonePeCustomerId;
  await order.save();

  if (order.orderType === 'trial_charge') {
    await createTrialSubscription({
      userId: order.user,
      order,
      mandateId: status.mandateId,
      metadata: status.raw,
    });
    return;
  }

  if (order.orderType === 'subscription_charge') {
    const now = new Date();
    const nextBillingAt = addMonths(now, 1);
    const subscription = await Subscription.findOneAndUpdate(
      { user: order.user },
      {
        $setOnInsert: {
          user: order.user,
          phonePeMerchantId: merchantId,
          createdAt: now,
        },
        $set: {
          status: 'subscribed',
          subscriptionType: 'monthly',
          trialConverted: true,
          currentPeriodStart: now,
          currentPeriodEnd: nextBillingAt,
          nextBillingAt,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await Order.findByIdAndUpdate(order._id, { subscription: subscription._id });
    await User.findByIdAndUpdate(order.user, {
      phonePeCustomerId: order.phonePeCustomerId || null,
      subscriptionStatus: 'subscribed',
      subscriptionId: subscription._id,
    });
  }
}

async function applyFailedPayment(order, status = {}) {
  order.status = 'failed';
  order.phonePeTransactionId = status.transactionId || order.phonePeTransactionId;
  await order.save();
}

async function initiateTrial(req, res) {
  try {
    const paymentType = req.body.paymentType === 'monthly' ? 'monthly' : 'trial';
    const existingSubscription = await Subscription.findOne({ user: req.user._id });
    const allowedUpgradeStatuses = ['1rs trial', 'trial', 'cancelled', 'expired'];
    const blockedStatuses = ['active', 'subscribed', 'paused'];
    if (existingSubscription) {
      if (paymentType === 'trial' && blockedStatuses.includes(existingSubscription.status)) {
        return res.status(409).json({ error: 'You already have a subscription' });
      }
      if (!allowedUpgradeStatuses.includes(existingSubscription.status)) {
        return res.status(409).json({ error: 'You already have a subscription' });
      }
    }

    const paymentRequest = isSimulatedPaymentEnabled()
      ? {
        merchantTransactionId: phonePeService.generateMerchantTransactionId(req.user._id),
        redirectUrl: null,
      }
      : paymentType === 'monthly'
        ? await phonePeService.createMonthlyPaymentRequest(req.user._id)
        : await phonePeService.createTrialPaymentRequest(req.user._id);

    await Order.create({
      user: req.user._id,
      totalAmount: paymentType === 'monthly' ? subscriptionAmountPaise : trialAmountPaise,
      gateway: isSimulatedPaymentEnabled() ? 'simulated' : 'phonepe',
      phonePeMerchantTransactionId: paymentRequest.merchantTransactionId,
      orderType: paymentType === 'monthly' ? 'subscription_charge' : 'trial_charge',
      status: 'pending',
    });

    res.status(201).json({
      redirectUrl: paymentRequest.redirectUrl || simulatedCheckoutUrl(req, paymentRequest.merchantTransactionId),
      merchantTransactionId: paymentRequest.merchantTransactionId,
      gateway: isSimulatedPaymentEnabled() ? 'simulated' : 'phonepe',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function renderPaymentSimulator(req, res) {
  try {
    if (!isSimulatedPaymentEnabled()) {
      return res.status(404).json({ error: 'Payment simulator is disabled' });
    }

    const merchantTransactionId = req.query.merchantTransactionId || req.query.transactionId;
    const order = merchantTransactionId
      ? await Order.findOne({ phonePeMerchantTransactionId: merchantTransactionId }).populate('user', 'fullName email mobileNumber')
      : null;

    if (!order) {
      return res.status(404).send('<!doctype html><title>Payment Simulator</title><h1>Order not found</h1>');
    }

    const rupees = (Number(order.totalAmount || 0) / 100).toFixed(2);
    const plan = order.orderType === 'subscription_charge' ? 'Monthly Subscription' : '1-Day Trial';
    const disabled = order.status !== 'pending' ? 'disabled' : '';

    return res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>EduNex Payment Simulator</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f7fb;color:#172033;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    main{width:min(440px,calc(100vw - 32px));background:white;border:1px solid #dde3ee;border-radius:8px;box-shadow:0 18px 50px rgba(23,32,51,.10);padding:28px}
    .eyebrow{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#2663eb;margin-bottom:10px}
    h1{font-size:24px;line-height:1.2;margin:0 0 18px}
    dl{display:grid;grid-template-columns:130px 1fr;gap:10px 14px;margin:0 0 24px;font-size:14px}
    dt{color:#667085}
    dd{margin:0;font-weight:700;word-break:break-word}
    form{display:grid;gap:10px}
    button{border:0;border-radius:8px;padding:13px 14px;font-weight:800;cursor:pointer}
    button:disabled{opacity:.45;cursor:not-allowed}
    .success{background:#0f9f6e;color:white}
    .failed{background:#fff1f0;color:#bd2b21;border:1px solid #f4b8b2}
    .cancel{background:#eef2f7;color:#344054}
    .note{margin-top:18px;font-size:12px;line-height:1.5;color:#667085}
  </style>
</head>
<body>
  <main>
    <div class="eyebrow">Local simulator</div>
    <h1>Complete EduNex Payment</h1>
    <dl>
      <dt>Plan</dt><dd>${escapeHtml(plan)}</dd>
      <dt>Amount</dt><dd>INR ${escapeHtml(rupees)}</dd>
      <dt>Status</dt><dd>${escapeHtml(order.status)}</dd>
      <dt>Order ID</dt><dd>${escapeHtml(order.phonePeMerchantTransactionId)}</dd>
      <dt>User</dt><dd>${escapeHtml(order.user?.fullName || order.user?.mobileNumber || 'EduNex user')}</dd>
    </dl>
    <form method="post" action="/api/payment/simulate/complete">
      <input type="hidden" name="merchantTransactionId" value="${escapeHtml(order.phonePeMerchantTransactionId)}">
      <button class="success" name="result" value="success" ${disabled}>Simulate Success</button>
      <button class="failed" name="result" value="failed" ${disabled}>Simulate Failure</button>
      <button class="cancel" name="result" value="cancelled" ${disabled}>Cancel Payment</button>
    </form>
    <div class="note">This page is available only when local simulated payments are enabled. It does not contact PhonePe.</div>
  </main>
</body>
</html>`);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function completeSimulatedPayment(req, res) {
  try {
    if (!isSimulatedPaymentEnabled()) {
      return res.status(404).json({ error: 'Payment simulator is disabled' });
    }

    const merchantTransactionId = req.body.merchantTransactionId || req.query.merchantTransactionId;
    const result = String(req.body.result || req.query.result || 'success').toLowerCase();
    const order = merchantTransactionId
      ? await Order.findOne({ phonePeMerchantTransactionId: merchantTransactionId })
      : null;

    if (!order) {
      return res.redirect(frontendDashboardUrl);
    }

    if (result === 'success') {
      const simulatedMandateId = order.orderType === 'trial_charge' ? `SIM_MANDATE_${merchantTransactionId}` : null;
      await applySuccessfulPayment(order, {
        success: true,
        transactionId: `SIM_${merchantTransactionId}`,
        paymentInstrument: 'UPI',
        mandateId: simulatedMandateId,
        raw: {
          provider: 'simulated',
          state: 'COMPLETED',
          transactionId: `SIM_${merchantTransactionId}`,
          paymentInstrument: 'UPI',
          mandateId: simulatedMandateId,
          completedAt: new Date().toISOString(),
        },
      });

      return res.redirect(withQueryParams(frontendPaymentSuccessUrl, {
        merchantTransactionId,
        simulated: 'true',
      }));
    }

    await applyFailedPayment(order, {
      transactionId: `SIM_${String(result || 'failed').toUpperCase()}_${merchantTransactionId}`,
    });

    return res.redirect(withQueryParams(frontendPaymentFailedUrl, {
      merchantTransactionId,
      simulated: 'true',
      reason: result === 'cancelled' ? 'cancelled' : 'failed',
    }));
  } catch (error) {
    console.error('Simulated payment error:', error);
    return res.redirect(frontendDashboardUrl);
  }
}

async function paymentCallback(req, res) {
  try {
    const merchantTransactionId = req.query.merchantTransactionId || req.query.transactionId;
    if (!merchantTransactionId) {
      return res.redirect(frontendDashboardUrl);
    }

    const order = await Order.findOne({ phonePeMerchantTransactionId: merchantTransactionId });
    if (!order) {
      return res.redirect(frontendDashboardUrl);
    }

    const status = await phonePeService.verifyPaymentStatus(merchantTransactionId);
    if (status.success) {
      await applySuccessfulPayment(order, status);
    } else {
      await applyFailedPayment(order, status);
      return res.redirect(frontendPaymentFailedUrl);
    }

    return res.redirect(withQueryParams(frontendPaymentSuccessUrl, { merchantTransactionId }));
  } catch (error) {
    console.error('PhonePe callback error:', error);
    return res.redirect(frontendDashboardUrl);
  }
}

async function handleWebhook(req, res) {
  try {
    const xVerify = req.headers['x-verify'];
    if (!phonePeService.verifyWebhookSignature(req.body, xVerify)) {
      return res.status(400).json({ error: 'Invalid PhonePe signature' });
    }

    const payload = extractWebhookPayload(req);
    const data = getWebhookData(payload);
    const event = getEventName(payload);
    const merchantTransactionId = data.merchantTransactionId || data.phonePeMerchantTransactionId;
    const phonePeTransactionId = data.transactionId || data.phonePeTransactionId || null;
    const phonePeCustomerId = extractPhonePeCustomerId(data);
    const amount = data.amount || null;
    const order = merchantTransactionId
      ? await Order.findOne({ phonePeMerchantTransactionId: merchantTransactionId })
      : null;
    let subscription = order?.subscription ? await Subscription.findById(order.subscription) : null;

    if (!subscription && order) {
      subscription = await Subscription.findOne({ user: order.user });
    }

    if (!subscription && data.merchantSubscriptionId) {
      subscription = await Subscription.findOne({ phonePeSubscriptionId: data.merchantSubscriptionId });
    }

    if (!subscription && order) {
      subscription = await Subscription.findOneAndUpdate(
        { user: order.user },
        {
          $setOnInsert: {
            user: order.user,
            phonePeMerchantId: merchantId,
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      await Order.findByIdAndUpdate(order._id, { subscription: subscription._id });
    }

    if (!subscription) {
      console.warn('PhonePe webhook received without matching subscription', payload);
      return res.sendStatus(200);
    }

    const userId = order?.user || subscription.user;
    const alreadyProcessed = phonePeTransactionId
      ? await SubscriptionEvent.findOne({ phonePeTransactionId, event })
      : null;
    if (alreadyProcessed) {
      return res.sendStatus(200);
    }

    if (event === 'MANDATE_APPROVED') {
      subscription.phonePeMandateId = data.mandateId || data.phonePeMandateId || subscription.phonePeMandateId;
      if (phonePeCustomerId) {
        if (order) {
          order.phonePeCustomerId = phonePeCustomerId;
          await order.save();
        }
        await User.findByIdAndUpdate(userId, { phonePeCustomerId });
      }
      // Propagate the PhonePe customer id from the order into the user record
      if (order?.phonePeCustomerId) {
        await User.findByIdAndUpdate(userId, {
          phonePeCustomerId: order.phonePeCustomerId,
        });
      }
      await subscription.save();
      await promoteTrialToSubscribedIfEligible(subscription, userId);
    }

    if (event === 'PAYMENT_SUCCESS') {
      if (order) {
        order.status = 'paid';
        order.paidAt = order.paidAt || new Date();
        order.phonePeTransactionId = phonePeTransactionId;
        order.phonePePaymentInstrument = normalizePaymentInstrument(data.paymentInstrument) || order.phonePePaymentInstrument;
        if (phonePeCustomerId) {
          order.phonePeCustomerId = phonePeCustomerId;
        }
        await order.save();
      }

      if (order?.orderType === 'trial_charge') {
        const now = new Date();
        subscription.status = '1rs trial';
        subscription.trialStartedAt = subscription.trialStartedAt || now;
        subscription.trialExpiresAt = subscription.trialExpiresAt || addHours(now, 24);
        await User.findByIdAndUpdate(userId, {
          phonePeCustomerId: phonePeCustomerId || order?.phonePeCustomerId || null,
          subscriptionStatus: '1rs trial',
          subscriptionId: subscription._id,
        });
      }

      if (order?.orderType === 'subscription_charge') {
        const now = new Date();
        const nextBillingAt = addMonths(now, 1);
        subscription.status = 'subscribed';
        subscription.subscriptionType = 'monthly';
        subscription.trialConverted = true;
        subscription.currentPeriodStart = now;
        subscription.currentPeriodEnd = nextBillingAt;
        subscription.nextBillingAt = nextBillingAt;
        await User.findByIdAndUpdate(userId, {
          phonePeCustomerId: phonePeCustomerId || order?.phonePeCustomerId || null,
          subscriptionStatus: 'subscribed',
          subscriptionId: subscription._id,
        });
      }

      await subscription.save();
    }

    if (event === 'PAYMENT_FAILED') {
      if (order) {
        order.status = 'failed';
        order.phonePeTransactionId = phonePeTransactionId;
        await order.save();
      }

      if (order?.orderType === 'subscription_charge') {
        subscription.status = 'expired';
        await subscription.save();
        await User.findByIdAndUpdate(userId, { subscriptionStatus: 'expired' });
      }
    }

    if (event === 'SUBSCRIPTION_CANCELLED' || event === 'MANDATE_REVOKED') {
      const now = new Date();
      const hasRemainingAccess = subscription.currentPeriodEnd && now < subscription.currentPeriodEnd;
      subscription.status = hasRemainingAccess ? 'subscribed' : 'expired';
      subscription.cancelledAt = subscription.cancelledAt || new Date();
      subscription.phonePeMandateId = null;
      await subscription.save();
      await User.findByIdAndUpdate(userId, {
        subscriptionStatus: hasRemainingAccess ? 'subscribed' : 'expired',
      });
    }

    await createSubscriptionEventOnce({
      subscription: subscription._id,
      user: userId,
      event,
      amount,
      phonePeTransactionId,
      phonePeMerchantTransactionId: merchantTransactionId,
      metadata: payload,
    });

    return res.sendStatus(200);
  } catch (error) {
    console.error('PhonePe webhook processing error:', error);
    return res.sendStatus(200);
  }
}

async function cancelSubscription(req, res) {
  try {
    const subscription = await Subscription.findOne({
      user: req.user._id,
      status: { $in: ['1rs trial', 'trial', 'active', 'subscribed', 'paused'] },
    });

    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    if (subscription.phonePeMandateId) {
      const cancellation = await phonePeService.cancelMandate(subscription.phonePeMandateId);
      if (!cancellation.success) {
        return res.status(502).json({ error: 'Unable to cancel PhonePe mandate' });
      }
    }

    subscription.status = 'cancelled';
    subscription.cancelledAt = new Date();
    subscription.phonePeMandateId = null;
    await subscription.save();
    await User.findByIdAndUpdate(req.user._id, {
      subscriptionStatus: subscription.currentPeriodEnd && new Date() < subscription.currentPeriodEnd
        ? 'subscribed'
        : 'expired',
    });
    await createSubscriptionEventOnce({
      subscription: subscription._id,
      user: req.user._id,
      event: 'SUBSCRIPTION_CANCELLED',
      metadata: { source: 'user' },
    });

    res.json({ success: true, accessUntil: subscription.currentPeriodEnd });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function subscriptionStatus(req, res) {
  try {
    const userSubscriptionStatus = req.user.subscriptionStatus || 'none';
    const subscription = await Subscription.findOne({ user: req.user._id });
    if (!subscription) {
      return res.json({
        status: userSubscriptionStatus,
        subscriptionStatus: userSubscriptionStatus,
        source: 'user',
      });
    }

    await promoteTrialToSubscribedIfEligible(subscription, req.user._id);
    const latest = await Subscription.findById(subscription._id);

    res.json({
      status: userSubscriptionStatus,
      subscriptionStatus: userSubscriptionStatus,
      subscriptionDocStatus: latest.status,
      source: 'subscription',
      trialExpiresAt: ['trial', '1rs trial'].includes(latest.status) ? latest.trialExpiresAt : null,
      currentPeriodEnd: ['active', 'subscribed'].includes(latest.status) ? latest.currentPeriodEnd : null,
      nextBillingAt: latest.nextBillingAt,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function verifyAppAccess(req, res) {
  try {
    const merchantTransactionId = req.query.merchantTransactionId || req.body?.merchantTransactionId;
    if (!merchantTransactionId) {
      return res.status(400).json({ error: 'merchantTransactionId is required' });
    }

    const order = await Order.findOne({ phonePeMerchantTransactionId: merchantTransactionId });
    if (!order) {
      return res.status(404).json({ error: 'Payment order not found' });
    }

    if (String(order.user) !== String(req.user._id)) {
      return res.status(403).json({
        verified: false,
        sameAccount: false,
        error: 'This purchase belongs to another account',
      });
    }

    const paid = order.status === 'paid';
    const subscription = await Subscription.findOne({ user: req.user._id });
    const activeStatuses = ['active', 'subscribed', '1rs trial', 'trial'];
    const hasAccess = paid && subscription && activeStatuses.includes(subscription.status);

    return res.json({
      verified: hasAccess,
      sameAccount: true,
      paid,
      orderStatus: order.status,
      subscriptionStatus: subscription?.status || 'none',
      merchantTransactionId,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  initiateTrial,
  renderPaymentSimulator,
  completeSimulatedPayment,
  paymentCallback,
  handleWebhook,
  cancelSubscription,
  subscriptionStatus,
  verifyAppAccess,
};
