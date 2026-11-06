const Order = require('../models/Order');
const Onboarding = require('../models/OnboardingSession');
const Subscription = require('../models/Subscription');
const SubscriptionEvent = require('../models/SubscriptionEvent');
const User = require('../models/User');
const phonePeService = require('../services/phonePeService');
const phonePeEventClaims = require('../services/phonePeEventClaims');
const { isPhonePeEnabled, isPhonePeNewPaymentsEnabled, isPhonePeNewPaymentsSwitchEnabled } = require('../services/phonePePolicy');
const paymentModes = require('../services/paymentMode');
const { resolveSubscriptionAccess } = require('../services/subscriptionAccess');
const { loadAccountEntitlement } = require('../services/accountEntitlement');
const { activeCourseEntitlements } = require('../services/courseAccess');
const { hasUsedIntroTrial } = require('../services/trialEligibility');

const isProduction = process.env.NODE_ENV === 'production';
const paymentGatewayMode = String(process.env.PAYMENT_GATEWAY_MODE || 'phonepe').trim().toLowerCase();
const merchantId = process.env.PHONEPE_MERCHANT_ID || process.env.PHONEPE_CLIENT_ID || 'your_merchant_id';
const trialAccessDurationHours = Number(process.env.TRIAL_ACCESS_DURATION_HOURS || process.env.TRIAL_ACCESS_HOURS || 26);
const frontendOrigin = (process.env.FRONTEND_ORIGIN || '').replace(/\/$/, '');
const frontendDashboardUrl = process.env.FRONTEND_DASHBOARD_URL || (frontendOrigin ? `${frontendOrigin}/courses.html` : '/courses.html');
const frontendPaymentSuccessUrl = process.env.FRONTEND_PAYMENT_SUCCESS_URL || (frontendOrigin ? `${frontendOrigin}/payment.html?payment=success` : '/payment.html?payment=success');
const frontendPaymentFailedUrl = process.env.FRONTEND_PAYMENT_FAILED_URL || (frontendOrigin ? `${frontendOrigin}/payment.html?status=failed` : '/payment.html?status=failed');
const allowedCheckoutOrigins = new Set([
  'https://skillomate.in',
  'https://www.skillomate.in',
  frontendOrigin,
  ...String(process.env.FRONTEND_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean),
].filter(Boolean));
const marketingPaymentReturnPath = '/static-pages/skillomate-ai-influencer-courseweb/index.html?payment=return#paywall';
const marketingPaymentReturnUrl = process.env.MARKETING_PAYMENT_RETURN_URL
  || process.env.MARKETING_CHECKOUT_RETURN_URL
  || (isProduction ? `https://skillomate.in${marketingPaymentReturnPath}` : (frontendOrigin ? `${frontendOrigin}${marketingPaymentReturnPath}` : marketingPaymentReturnPath));
const simulatedPaymentModes = ['simulated', 'simulation', 'mock', 'local'];
const defaultPendingCheckoutExpirySeconds = isProduction ? 20 * 60 : 30;

function isSimulatedPaymentEnabled() {
  return !isProduction && simulatedPaymentModes.includes(paymentGatewayMode);
}

function pendingCheckoutExpiryMs() {
  const seconds = Number(process.env.PHONEPE_PENDING_CHECKOUT_EXPIRY_SECONDS || defaultPendingCheckoutExpirySeconds);
  return Math.max(15, Math.min(Number.isFinite(seconds) ? seconds : defaultPendingCheckoutExpirySeconds, 20 * 60)) * 1000;
}

function isPendingCheckoutExpired(order, now = Date.now()) {
  if (!order?.createdAt) return false;
  const createdAt = new Date(order.createdAt).getTime();
  return Number.isFinite(createdAt) && now - createdAt >= pendingCheckoutExpiryMs();
}

async function expireStaleOneTimeOrder(order) {
  if (!order || order.status !== 'pending' || !isPendingCheckoutExpired(order)) return false;
  await applyFailedPayment(order, { state: 'EXPIRED' });
  return true;
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

function canonicalMarketingReturnUrl(value) {
  const candidate = value || marketingPaymentReturnUrl;
  try {
    const parsed = new URL(candidate, frontendOrigin || 'https://skillomate.in');
    if (parsed.hostname === 'api.skillomate.in') {
      parsed.protocol = 'https:';
      parsed.hostname = 'skillomate.in';
      parsed.port = '';
    }
    if (parsed.pathname === '/static-pages/skillomate-ai-influencer-courseweb/'
      || parsed.pathname === '/static-pages/skillomate-ai-influencer-courseweb') {
      parsed.pathname = '/static-pages/skillomate-ai-influencer-courseweb/index.html';
    }
    if (!parsed.searchParams.has('payment')) parsed.searchParams.set('payment', 'return');
    if (!parsed.hash) parsed.hash = '#paywall';
    return parsed.toString();
  } catch {
    return marketingPaymentReturnUrl;
  }
}

function paymentSuccessUrlForOrder(order) {
  if (order?.orderType === 'one_time_access') return canonicalMarketingReturnUrl(order.checkoutReturnUrl);
  if (order?.checkoutReturnUrl) return order.checkoutReturnUrl;
  return frontendPaymentSuccessUrl;
}

async function paymentSuccessRedirectUrlForOrder(order) {
  if (order?.orderType !== 'one_time_access' || order.status !== 'paid') return paymentSuccessUrlForOrder(order);
  const subscription = order.subscription
    ? await Subscription.findById(order.subscription)
    : await Subscription.findOne({ user: order.user });
  if (!resolveSubscriptionAccess(subscription, {}).active) return paymentSuccessUrlForOrder(order);

  const code = crypto.randomBytes(32).toString('hex');
  const result = await Onboarding.updateOne(
    { _id: order.user, completedAt: null },
    {
      $set: {
        handoffHash: crypto.createHash('sha256').update(code).digest('hex'),
        handoffExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    }
  );
  if (!result.matchedCount) return paymentSuccessUrlForOrder(order);
  const signupUrl = frontendOrigin ? `${frontendOrigin}/signup` : '/signup';
  return `${signupUrl}#onboarding=${encodeURIComponent(code)}`;
}

function paymentFailedUrlForOrder(order) {
  if (order?.orderType === 'one_time_access') return canonicalMarketingReturnUrl(order.checkoutReturnUrl);
  if (order?.checkoutReturnUrl) return order.checkoutReturnUrl;
  return frontendPaymentFailedUrl;
}

function safeCheckoutReturnUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw, frontendOrigin || 'http://localhost');
    if (frontendOrigin) {
      if (!allowedCheckoutOrigins.has(parsed.origin)) return null;
    } else if (!raw.startsWith('/')) {
      return null;
    }
    return frontendOrigin ? parsed.toString() : `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
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

function wantsJsonResponse(req) {
  return String(req.headers.accept || '').toLowerCase().includes('application/json')
    || req.is('application/json');
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function hasValidAccess(status, trialExpiresAt, currentPeriodEnd, now = new Date()) {
  const normalized = String(status || '').toLowerCase();
  if (['trial', '1rs trial'].includes(normalized)) {
    return Boolean(trialExpiresAt && new Date(trialExpiresAt) > now);
  }
  if (['active', 'subscribed'].includes(normalized)) {
    return !currentPeriodEnd || new Date(currentPeriodEnd) > now;
  }
  if (['cancelled', 'paused'].includes(normalized)) {
    return Boolean(currentPeriodEnd && new Date(currentPeriodEnd) > now);
  }
  return false;
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
  return payload.payload || payload.data || payload.response || payload;
}

function getEventName(payload) {
  return payload.event || payload.eventType || payload.type || getWebhookData(payload).event || getWebhookData(payload).eventType;
}

function webhookPaymentFlow(data = {}) {
  return data.paymentFlow || data.payment_flow || {};
}

function webhookPaymentDetail(data = {}) {
  return data.paymentDetails?.[0] || data.paymentDetail?.[0] || {};
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

async function promoteTrialToSubscribedIfEligible() {
  // A mandate is consent, not a successful recurring charge. Payment events grant access.
  return false;
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
  const now = order.paidAt || new Date();
  const trialExpiresAt = addHours(now, trialAccessDurationHours);
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
        phonePeSubscriptionId: order.phonePeMerchantSubscriptionId || null,
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
  if (order.orderType === 'one_time_access' && status.amount !== order.totalAmount) {
    throw new Error('PhonePe payment amount did not match the order.');
  }
  order.status = 'paid';
  order.paidAt = order.paidAt || new Date();
  order.phonePeTransactionId = status.transactionId;
  order.phonePePaymentInstrument = status.paymentInstrument;
  order.phonePeCustomerId = extractPhonePeCustomerId(status.raw?.data || status.raw) || order.phonePeCustomerId;
  order.phonePeMerchantSubscriptionId = status.merchantSubscriptionId || order.phonePeMerchantSubscriptionId;
  if (order.orderType === 'one_time_access') {
    const now = order.paidAt;
    const accessUntil = addDays(now, phonePeService.oneTimeAccessDays);
    const subscription = await Subscription.findOneAndUpdate(
      { user: order.user },
      {
        $setOnInsert: { user: order.user, phonePeMerchantId: merchantId, createdAt: now },
        $set: {
          gateway: 'phonepe',
          status: 'subscribed',
          subscriptionType: 'monthly',
          frequency: 'once',
          amount: order.totalAmount,
          trialExpiresAt: null,
          currentPeriodStart: now,
          currentPeriodEnd: accessUntil,
          nextBillingAt: null,
          phonePeSubscriptionId: null,
          phonePeMandateId: null,
          cancelledAt: null,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    await Order.findByIdAndUpdate(order._id, { subscription: subscription._id });
    await User.findByIdAndUpdate(order.user, {
      subscriptionStatus: 'subscribed',
      subscriptionExpiry: accessUntil,
      subscriptionId: subscription._id,
    });
    await createSubscriptionEventOnce({
      subscription: subscription._id,
      user: order.user,
      event: 'PAYMENT_SUCCESS',
      amount: order.totalAmount,
      phonePeTransactionId: order.phonePeTransactionId,
      phonePeMerchantTransactionId: order.phonePeMerchantTransactionId,
      metadata: { paymentType: 'one_time_access' },
    });
    await order.save();
    return;
  }

  await order.save();

  if (order.orderType === 'trial_charge' || order.orderType === 'mandate_setup') {
    await createTrialSubscription({
      userId: order.user,
      order,
      mandateId: status.mandateId || order.phonePeMerchantSubscriptionId,
      metadata: status.raw,
    });
    return;
  }

  if (order.orderType === 'subscription_charge') {
    const now = order.paidAt || new Date();
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
  if (order.status === 'paid') return;
  order.status = 'failed';
  order.phonePeTransactionId = status.transactionId || order.phonePeTransactionId;
  await order.save();
}

async function reconcileOneTimeOrder(order) {
  if (order.status !== 'pending') return order.status;
  const status = await phonePeService.verifyPaymentStatus(order.phonePeMerchantTransactionId);
  if (status.success) await applySuccessfulPayment(order, status);
  else if (['FAILED', 'CANCELLED', 'EXPIRED', 'DECLINED'].includes(status.state)) await applyFailedPayment(order, status);
  return order.status;
}

async function reconcilePhonePeForUser(userId) {
  const pendingOrder = await Order.findOne({ user: userId, gateway: 'phonepe', orderType: 'one_time_access', status: 'pending' }).sort({ createdAt: -1 });
  if (await expireStaleOneTimeOrder(pendingOrder)) return Subscription.findOne({ user: userId, gateway: 'phonepe' });
  if (pendingOrder && !isSimulatedPaymentEnabled()) await reconcileOneTimeOrder(pendingOrder);
  return Subscription.findOne({ user: userId, gateway: 'phonepe' });
}

async function initiateTrial(req, res) {
  try {
    const activeProvider = await paymentModes.activeProvider();
    const ready = phonePeService.readiness();
    const requestProvider = req.onboardingProvider || activeProvider;
    const phonePeEnabledForRequest = req.onboardingProvider === 'phonepe'
      ? isPhonePeNewPaymentsSwitchEnabled(process.env)
      : isPhonePeNewPaymentsEnabled(process.env);
    if (!isSimulatedPaymentEnabled() && (requestProvider !== 'phonepe' || !phonePeEnabledForRequest || !ready.configured)) {
      return res.status(410).json({ error: 'PhonePe checkout is no longer available.' });
    }
    const existingSubscription = await Subscription.findOne({ user: req.user._id });
    if (resolveSubscriptionAccess(existingSubscription, req.user).active) {
      return res.status(409).json({ error: 'Premium access is already active.' });
    }
    if (existingSubscription?.phonePeMandateId && !existingSubscription.cancelledAt) {
      return res.status(409).json({ error: 'An existing PhonePe mandate must be cancelled before a one-time payment.' });
    }
    const pendingOrder = await Order.findOne({ user: req.user._id, gateway: 'phonepe', orderType: 'one_time_access', status: 'pending' }).sort({ createdAt: -1 });
    if (pendingOrder) {
      if (await expireStaleOneTimeOrder(pendingOrder)) {
        pendingOrder.status = 'failed';
      }
      const state = isSimulatedPaymentEnabled() && pendingOrder.status === 'pending' ? 'pending' : await reconcileOneTimeOrder(pendingOrder);
      if (state === 'paid') return res.status(409).json({ error: 'Payment has already succeeded. Refresh your access status.' });
      if (state === 'pending') return res.status(409).json({ error: 'An unfinished checkout exists. Check payment status before paying again.' });
    }

    const paymentRequest = isSimulatedPaymentEnabled()
      ? {
        merchantTransactionId: phonePeService.generateMerchantTransactionId(req.user._id),
        redirectUrl: null,
      }
      : await phonePeService.createOneTimePaymentRequest(req.user._id);

    await Order.create({
      user: req.user._id,
      totalAmount: phonePeService.oneTimeChargeAmountPaise || phonePeService.oneTimeAmountPaise,
      gateway: isSimulatedPaymentEnabled() ? 'simulated' : 'phonepe',
      phonePeMerchantTransactionId: paymentRequest.merchantTransactionId,
      phonePeMerchantSubscriptionId: paymentRequest.merchantSubscriptionId || null,
      orderType: 'one_time_access',
      checkoutReturnUrl: canonicalMarketingReturnUrl(safeCheckoutReturnUrl(req.body?.returnUrl)),
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
    const plan = order.orderType === 'one_time_access' ? '30-Day Premium Access'
      : order.orderType === 'subscription_charge' ? 'Monthly Subscription' : '1-Day Trial';
    const disabled = order.status !== 'pending' ? 'disabled' : '';

    return res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Skillomate Payment Simulator</title>
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
    <h1>Complete Skillomate Payment</h1>
    <dl>
      <dt>Plan</dt><dd>${escapeHtml(plan)}</dd>
      <dt>Amount</dt><dd>INR ${escapeHtml(rupees)}</dd>
      <dt>Status</dt><dd>${escapeHtml(order.status)}</dd>
      <dt>Order ID</dt><dd>${escapeHtml(order.phonePeMerchantTransactionId)}</dd>
      <dt>User</dt><dd>${escapeHtml(order.user?.fullName || order.user?.mobileNumber || 'Skillomate user')}</dd>
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

    const merchantTransactionId = req.body?.merchantTransactionId || req.query.merchantTransactionId;
    const result = String(req.body?.result || req.query.result || 'success').toLowerCase();
    const order = merchantTransactionId
      ? await Order.findOne({ phonePeMerchantTransactionId: merchantTransactionId })
      : null;

    if (!order) {
      if (wantsJsonResponse(req)) {
        return res.status(404).json({ success: false, error: 'Payment order not found' });
      }
      return res.redirect(frontendDashboardUrl);
    }

    if (order.status !== 'pending') {
      if (order.status === 'paid' && result === 'success') {
        if (wantsJsonResponse(req)) {
          return res.json({ success: true, merchantTransactionId, simulated: true, alreadyCompleted: true });
        }
        return res.redirect(withQueryParams(await paymentSuccessRedirectUrlForOrder(order), {
          merchantTransactionId,
          simulated: 'true',
        }));
      }
      if (wantsJsonResponse(req)) {
        return res.status(409).json({ success: false, error: `Payment order is already ${order.status}` });
      }
      return res.redirect(withQueryParams(paymentFailedUrlForOrder(order), {
        merchantTransactionId,
        simulated: 'true',
        reason: 'already_completed',
      }));
    }

    if (result === 'success') {
      const simulatedMandateId = order.orderType === 'trial_charge' ? `SIM_MANDATE_${merchantTransactionId}` : null;
      await applySuccessfulPayment(order, {
        success: true,
        amount: order.totalAmount,
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

      if (wantsJsonResponse(req)) {
        return res.json({
          success: true,
          merchantTransactionId,
          simulated: true,
        });
      }

      return res.redirect(withQueryParams(await paymentSuccessRedirectUrlForOrder(order), {
        merchantTransactionId,
        simulated: 'true',
      }));
    }

    await applyFailedPayment(order, {
      transactionId: `SIM_${String(result || 'failed').toUpperCase()}_${merchantTransactionId}`,
    });

    if (wantsJsonResponse(req)) {
      return res.status(402).json({
        success: false,
        merchantTransactionId,
        simulated: true,
        reason: result === 'cancelled' ? 'cancelled' : 'failed',
      });
    }

    return res.redirect(withQueryParams(paymentFailedUrlForOrder(order), {
      merchantTransactionId,
      simulated: 'true',
      reason: result === 'cancelled' ? 'cancelled' : 'failed',
    }));
  } catch (error) {
    console.error(`Simulated payment failed (${error?.code || error?.name || 'unknown'})`);
    if (wantsJsonResponse(req)) {
      return res.status(500).json({ success: false, error: 'Simulated payment failed' });
    }
    return res.redirect(frontendDashboardUrl);
  }
}

async function paymentCallback(req, res) {
  const activeProvider = await paymentModes.activeProvider().catch(() => null);
  if (activeProvider !== 'phonepe' && !isPhonePeEnabled(process.env)) {
    return res.status(410).json({ error: 'PhonePe payment confirmation is disabled.' });
  }
  let claim = null;
  let merchantTransactionId = null;
  let order = null;
  try {
    merchantTransactionId = req.query.merchantTransactionId || req.query.transactionId;
    if (!merchantTransactionId) {
      return res.redirect(frontendDashboardUrl);
    }

    order = await Order.findOne({ phonePeMerchantTransactionId: merchantTransactionId });
    if (!order) {
      return res.redirect(frontendDashboardUrl);
    }

    claim = await phonePeEventClaims.claimPhonePeEvent({
      eventKey: phonePeEventClaims.callbackEventIdentity(merchantTransactionId),
      source: 'callback',
      eventType: 'PAYMENT_RESULT',
    });
    if (!claim.acquired) {
      return res.redirect(withQueryParams(await paymentSuccessRedirectUrlForOrder(order), { merchantTransactionId }));
    }

    const status = order.orderType === 'one_time_access'
      ? { state: await reconcileOneTimeOrder(order) }
      : order.orderType === 'mandate_setup'
        ? await phonePeService.verifySubscriptionOrderStatus(merchantTransactionId)
        : await phonePeService.verifyPaymentStatus(merchantTransactionId);
    if (status.state === 'paid' || status.success) {
      if (order.orderType !== 'one_time_access') await applySuccessfulPayment(order, status);
    } else if (status.state === 'failed' || ['FAILED', 'CANCELLED', 'EXPIRED', 'DECLINED'].includes(status.state)) {
      if (order.orderType !== 'one_time_access') await applyFailedPayment(order, status);
      await phonePeEventClaims.markPhonePeEventProcessed(claim);
      return res.redirect(withQueryParams(paymentFailedUrlForOrder(order), { merchantTransactionId }));
    } else {
      throw new Error('PhonePe payment is not in a terminal state.');
    }

    await phonePeEventClaims.markPhonePeEventProcessed(claim);
    return res.redirect(withQueryParams(await paymentSuccessRedirectUrlForOrder(order), { merchantTransactionId, payment: 'success' }));
  } catch (error) {
    await phonePeEventClaims.markPhonePeEventFailed(claim, 'callback_processing_error').catch(() => {});
    console.error('PhonePe callback processing failed; the event remains retryable.');
    if (order) {
      return res.redirect(withQueryParams(paymentSuccessUrlForOrder(order), {
        merchantTransactionId,
        payment: 'return',
        confirmation: 'pending',
      }));
    }
    return res.redirect(withQueryParams(marketingPaymentReturnUrl, {
      merchantTransactionId,
      payment: 'return',
      confirmation: 'pending',
    }));
  }
}

async function processPhonePeWebhook({ payload, data, event, merchantTransactionId, phonePeTransactionId }) {
  const phonePeCustomerId = extractPhonePeCustomerId(data);
  const paymentFlow = webhookPaymentFlow(data);
  const amount = data.amount || null;
  const order = merchantTransactionId
    ? await Order.findOne({ phonePeMerchantTransactionId: merchantTransactionId })
    : null;
  if (order && await Subscription.exists({ user: order.user, gateway: 'razorpay' })) return;
  let subscription = order?.subscription ? await Subscription.findById(order.subscription) : null;

  if (!subscription && order) subscription = await Subscription.findOne({ user: order.user });
  const merchantSubscriptionId = data.merchantSubscriptionId || paymentFlow.merchantSubscriptionId || order?.phonePeMerchantSubscriptionId || null;
  if (!subscription && merchantSubscriptionId) {
    subscription = await Subscription.findOne({ phonePeSubscriptionId: merchantSubscriptionId });
  }
  if (!subscription && order) {
    subscription = await Subscription.findOneAndUpdate(
      { user: order.user },
      { $setOnInsert: { user: order.user, phonePeMerchantId: merchantId } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    await Order.findByIdAndUpdate(order._id, { subscription: subscription._id });
  }

  if (subscription?.gateway === 'razorpay') return;
  if (!subscription) {
    console.warn('PhonePe webhook received without a matching legacy subscription.');
    return;
  }

  const userId = order?.user || subscription.user;
  if (event === 'MANDATE_APPROVED' || event === 'CHECKOUT.ORDER.COMPLETED' || event === 'SUBSCRIPTION.SETUP.ORDER.COMPLETED' || event === 'SUBSCRIPTION.ACTIVE') {
    subscription.phonePeSubscriptionId = merchantSubscriptionId || subscription.phonePeSubscriptionId;
    subscription.phonePeMandateId = data.subscriptionId || paymentFlow.subscriptionId || data.mandateId || data.phonePeMandateId || subscription.phonePeMandateId;
    if (phonePeCustomerId) {
      if (order) {
        order.phonePeCustomerId = phonePeCustomerId;
        await order.save();
      }
      await User.findByIdAndUpdate(userId, { phonePeCustomerId });
    }
    if (order?.phonePeCustomerId) {
      await User.findByIdAndUpdate(userId, { phonePeCustomerId: order.phonePeCustomerId });
    }
    if (order?.orderType === 'mandate_setup') {
      order.status = 'paid';
      order.paidAt = order.paidAt || new Date();
      order.phonePeTransactionId = phonePeTransactionId || order.phonePeTransactionId;
      await order.save();
      const now = order.paidAt || new Date();
      subscription.status = '1rs trial';
      subscription.subscriptionType = 'trial';
      subscription.trialStartedAt = subscription.trialStartedAt || now;
      subscription.trialExpiresAt = subscription.trialExpiresAt || addHours(now, trialAccessDurationHours);
      await User.findByIdAndUpdate(userId, {
        phonePeCustomerId: phonePeCustomerId || order.phonePeCustomerId || null,
        subscriptionStatus: '1rs trial',
        subscriptionId: subscription._id,
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
      if (phonePeCustomerId) order.phonePeCustomerId = phonePeCustomerId;
      await order.save();
    }

    if (order?.orderType === 'trial_charge' || order?.orderType === 'mandate_setup') {
      const now = order.paidAt || new Date();
      subscription.status = '1rs trial';
      subscription.trialStartedAt = subscription.trialStartedAt || now;
      subscription.trialExpiresAt = subscription.trialExpiresAt || addHours(now, trialAccessDurationHours);
      await User.findByIdAndUpdate(userId, {
        phonePeCustomerId: phonePeCustomerId || order.phonePeCustomerId || null,
        subscriptionStatus: '1rs trial',
        subscriptionId: subscription._id,
      });
    }

    if (order?.orderType === 'subscription_charge') {
      const now = order.paidAt || new Date();
      const nextBillingAt = addMonths(now, 1);
      subscription.status = 'subscribed';
      subscription.subscriptionType = 'monthly';
      subscription.trialConverted = true;
      subscription.currentPeriodStart = now;
      subscription.currentPeriodEnd = nextBillingAt;
      subscription.nextBillingAt = nextBillingAt;
      await User.findByIdAndUpdate(userId, {
        phonePeCustomerId: phonePeCustomerId || order.phonePeCustomerId || null,
        subscriptionStatus: 'subscribed',
        subscriptionId: subscription._id,
      });
    }
    await subscription.save();
  }

  if (event === 'PAYMENT_FAILED' || event === 'CHECKOUT.ORDER.FAILED' || event === 'SUBSCRIPTION.SETUP.ORDER.FAILED') {
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
    subscription.cancelledAt = subscription.cancelledAt || now;
    subscription.phonePeMandateId = null;
    await subscription.save();
    await User.findByIdAndUpdate(userId, { subscriptionStatus: hasRemainingAccess ? 'subscribed' : 'expired' });
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
}

async function handleWebhook(req, res) {
  const activeProvider = await paymentModes.activeProvider().catch(() => null);
  if (activeProvider !== 'phonepe' && !isPhonePeEnabled(process.env)) {
    return res.status(410).json({ error: 'PhonePe webhook is disabled.' });
  }
  let claim = null;
  try {
    if (!phonePeService.verifyWebhookSignature(req.body, req.headers)) {
      return res.status(400).json({ error: 'Invalid PhonePe signature' });
    }
    let payload;
    try {
      payload = extractWebhookPayload(req);
    } catch {
      return res.status(400).json({ error: 'Invalid PhonePe payload' });
    }
    const data = getWebhookData(payload);
    const event = String(getEventName(payload) || '').trim().toUpperCase();
    const paymentFlow = webhookPaymentFlow(data);
    const paymentDetail = webhookPaymentDetail(data);
    const merchantSubscriptionId = data.merchantSubscriptionId || paymentFlow.merchantSubscriptionId || null;
    const merchantTransactionId = data.merchantTransactionId || data.merchantOrderId || data.phonePeMerchantTransactionId || null;
    const phonePeTransactionId = data.transactionId || data.phonePeTransactionId || paymentDetail.transactionId || null;
    const eventKey = phonePeEventClaims.webhookEventIdentity({
      event,
      merchantTransactionId,
      phonePeTransactionId,
      merchantSubscriptionId,
    });
    if (!eventKey) return res.status(400).json({ error: 'PhonePe event identity is required' });

    claim = await phonePeEventClaims.claimPhonePeEvent({ eventKey, source: 'webhook', eventType: event });
    if (!claim.acquired) return res.sendStatus(200);

    const oneTimeOrder = merchantTransactionId
      ? await Order.findOne({ phonePeMerchantTransactionId: merchantTransactionId, gateway: 'phonepe', orderType: 'one_time_access' })
      : null;
    if (oneTimeOrder) {
      if (['CHECKOUT.ORDER.COMPLETED', 'CHECKOUT.ORDER.FAILED', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED'].includes(event)) {
        const state = await reconcileOneTimeOrder(oneTimeOrder);
        if (state === 'pending') throw new Error('PhonePe order status is still pending.');
      }
      await phonePeEventClaims.markPhonePeEventProcessed(claim);
      return res.sendStatus(200);
    }

    await processPhonePeWebhook({ payload, data, event, merchantTransactionId, phonePeTransactionId });
    await phonePeEventClaims.markPhonePeEventProcessed(claim);
    return res.sendStatus(200);
  } catch (error) {
    await phonePeEventClaims.markPhonePeEventFailed(claim, 'webhook_processing_error').catch(() => {});
    console.error('PhonePe webhook processing failed; the event remains retryable.');
    return res.status(503).json({ error: 'Webhook processing is temporarily unavailable.' });
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
    const remainingAccess = resolveSubscriptionAccess(subscription, req.user);
    await User.findByIdAndUpdate(req.user._id, {
      subscriptionStatus: remainingAccess.active ? remainingAccess.status : 'expired',
      subscriptionExpiry: remainingAccess.expiresAt,
    });
    await createSubscriptionEventOnce({
      subscription: subscription._id,
      user: req.user._id,
      event: 'SUBSCRIPTION_CANCELLED',
      metadata: { source: 'user' },
    });

    res.json({ success: true, accessUntil: remainingAccess.expiresAt });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function subscriptionStatus(req, res) {
  try {
    const pendingOrder = await Order.findOne({ user: req.user._id, gateway: 'phonepe', orderType: 'one_time_access', status: 'pending' }).sort({ createdAt: -1 });
    if (await expireStaleOneTimeOrder(pendingOrder)) {
      pendingOrder.status = 'failed';
    }
    if (pendingOrder && !isSimulatedPaymentEnabled()) {
      try { await reconcileOneTimeOrder(pendingOrder); }
      catch (error) { console.warn('PhonePe payment status check is temporarily unavailable.'); }
    }
    const pendingCheckout = pendingOrder?.status === 'pending';
    const courseEntitlements = activeCourseEntitlements(req.user);
    const courseIds = courseEntitlements.map((item) => item.courseId);
    const subscription = await Subscription.findOne({ user: req.user._id });
    const trialUsed = await hasUsedIntroTrial(req.user._id, subscription, req.user);
    if (!subscription) {
      const { access } = await loadAccountEntitlement(req.user);
      return res.json({
        status: access.status,
        subscriptionStatus: access.status,
        subscriptionExpiry: access.expiresAt || null,
        entitlementState: access.entitlementState || (access.active ? 'ACTIVE' : 'NONE'),
        entitlementSource: access.source || 'none',
        source: access.source || 'none',
        accessGranted: access.active,
        hasActiveAccess: access.active,
        hasCourseAccess: courseIds.length > 0,
        courseIds,
        courseEntitlements,
        trialUsed,
        trialEligible: !trialUsed,
        subscriptionType: null,
        billingType: null,
        autoRenewEnabled: false,
        pendingCheckout,
      });
    }

    await promoteTrialToSubscribedIfEligible(subscription, req.user._id);
    const latest = await Subscription.findById(subscription._id);
    const { access } = await loadAccountEntitlement(req.user);

    res.json({
      status: access.status,
      subscriptionStatus: access.status,
      subscriptionDocStatus: latest.status,
      hasActiveAccess: access.active,
      entitlementState: access.entitlementState || (access.active ? 'ACTIVE' : 'NONE'),
      entitlementSource: access.source || 'none',
      subscriptionExpiry: access.expiresAt || null,
      grace: Boolean(access.grace),
      graceExpiresAt: access.graceExpiresAt || null,
      hasCourseAccess: courseIds.length > 0,
      courseIds,
      courseEntitlements,
      accessGranted: access.active,
      source: access.source || 'none',
      trialExpiresAt: latest.trialExpiresAt || null,
      currentPeriodEnd: latest.currentPeriodEnd || null,
      nextBillingAt: latest.nextBillingAt,
      trialUsed,
      trialEligible: !trialUsed,
      subscriptionType: latest.subscriptionType || null,
      billingType: latest.frequency === 'once' ? 'one_time' : 'recurring',
      autoRenewEnabled: Boolean(latest.phonePeMandateId && !latest.cancelledAt),
      pendingCheckout,
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

    if (order.orderType === 'one_time_access' && order.status === 'pending') await reconcileOneTimeOrder(order);
    const paid = order.status === 'paid';
    const subscription = await Subscription.findOne({ user: req.user._id });
    const hasAccess = Boolean(paid && resolveSubscriptionAccess(subscription, req.user).active);

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

function phonePePricing(_req, res) {
  res.json({
    gateway: isSimulatedPaymentEnabled() ? 'simulated' : 'phonepe',
    currency: 'INR',
    oneTimeAmountPaise: phonePeService.oneTimeAmountPaise,
    accessDays: phonePeService.oneTimeAccessDays,
    autoRenewEnabled: false,
  });
}

module.exports = {
  initiateTrial,
  phonePePricing,
  reconcilePhonePeForUser,
  renderPaymentSimulator,
  completeSimulatedPayment,
  paymentCallback,
  handleWebhook,
  cancelSubscription,
  subscriptionStatus,
  verifyAppAccess,
};
