const express = require('express');
const { protect } = require('../middleware/auth');
const paymentController = require('../controllers/paymentController');

const router = express.Router();
const razorpay = require('../controllers/razorpayController');
const standardPhonePe = require('../controllers/phonePeStandardAutoPayController');
const standardPhonePeService = require('../services/phonePeStandardAutoPayService');
const PhonePeAutoPayBilling = require('../models/PhonePeAutoPayBilling');
const RazorpayBilling = require('../models/RazorpayBilling');
const Subscription = require('../models/Subscription');
const autoPayTestRoutes = require('./phonePeAutoPayTest');
const autoPayTestController = require('../controllers/phonePeAutoPayTestController');
const modes = require('../services/paymentMode');

function standardPhonePeEnabled() {
  const readiness = standardPhonePeService.readiness();
  return readiness.configured
    && readiness.schedulerEnabled
    && (readiness.mode !== 'live' || readiness.liveRecurringEnabled);
}

async function configuredProvider() {
  const provider = await modes.activeProvider();
  if (provider === 'phonepe') {
    return standardPhonePeEnabled() ? 'phonepe' : 'disabled';
  }
  if (provider === 'razorpay') return 'razorpay';
  return 'disabled';
}

router.get('/payment/config', async (req, res, next) => {
  try {
    const provider = await configuredProvider();
    if (provider === 'phonepe') {
      return standardPhonePe.pricing(req, res, next);
    }
    if (provider === 'simulated') return paymentController.phonePePricing(req, res);
    if (provider === 'disabled') return res.status(503).json({ error: 'Payment checkout is unavailable.' });
    return razorpay.pricing(req, res, next);
  } catch (error) { return next(error); }
});
router.post('/payment/razorpay/verify', protect, razorpay.verify);
router.post('/webhooks/razorpay', razorpay.webhook);

router.post('/payment/initiate-trial', protect, async (req, res, next) => {
  const provider = await configuredProvider();
  if (provider === 'razorpay') return razorpay.initiate(req, res, next);
  if (provider === 'phonepe') {
    return standardPhonePe.initiate(req, res, next);
  }
  if (provider === 'simulated') return paymentController.initiateTrial(req, res, next);
  return res.status(503).json({ error: 'Payment checkout is unavailable.' });
});
router.post('/payment/phonepe/autopay/mobile/order', protect, standardPhonePe.initiateMobile);
router.get('/payment/simulate', paymentController.renderPaymentSimulator);
router.post('/payment/simulate/complete', paymentController.completeSimulatedPayment);
router.get('/payment/callback', paymentController.paymentCallback);
function parsePhonePeWebhook(req) {
  try {
    return JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body || {}));
  } catch {
    return null;
  }
}

async function standardBillingForWebhook(payload) {
  const data = payload?.payload || payload?.data || payload || {};
  const flow = data.paymentFlow || {};
  const merchantOrderId = data.merchantOrderId || null;
  const merchantSubscriptionId = flow.merchantSubscriptionId || data.merchantSubscriptionId || null;
  if (!merchantOrderId && !merchantSubscriptionId) return null;
  return PhonePeAutoPayBilling.exists({
    $or: [
      ...(merchantOrderId ? [{ setupMerchantOrderId: merchantOrderId }, { 'currentCycle.merchantOrderId': merchantOrderId }] : []),
      ...(merchantSubscriptionId ? [{ merchantSubscriptionId }] : []),
    ],
  });
}

router.post('/webhooks/phonepe/autopay', async (req, res, next) => {
  try {
    const payload = parsePhonePeWebhook(req);
    if (!payload) return res.status(400).json({ error: 'Invalid PhonePe payload.' });
    const standardBilling = await standardBillingForWebhook(payload);
    if (standardBilling || !autoPayTestRoutes.autoPayTestRoutesAllowed(process.env)) {
      return standardPhonePe.webhook(req, res, next);
    }
    return autoPayTestController.webhook(req, res, next);
  } catch (error) { return next(error); }
});

router.post('/webhooks/phonepe', async (req, res, next) => {
  try {
    const payload = parsePhonePeWebhook(req);
    if (!payload) return res.status(400).json({ error: 'Invalid PhonePe payload.' });
    const standardBilling = await standardBillingForWebhook(payload);
    return standardBilling
      ? standardPhonePe.webhook(req, res, next)
      : paymentController.handleWebhook(req, res, next);
  } catch (error) { return next(error); }
});

async function accountBillingHandler(req, res, next, handlers) {
  try {
    const [phonePeBilling, razorpayBilling, subscription] = await Promise.all([
      PhonePeAutoPayBilling.findById(req.user._id).select('phase').lean(),
      RazorpayBilling.findById(req.user._id).select('subscriptionId phase').lean(),
      Subscription.findOne({ user: req.user._id }).select('gateway phonePeMandateId razorpaySubscriptionId').lean(),
    ]);
    if (phonePeBilling || (subscription?.gateway === 'phonepe' && subscription?.phonePeMandateId && standardPhonePeEnabled())) {
      return handlers.standard(req, res, next);
    }
    if (razorpayBilling?.subscriptionId || subscription?.gateway === 'razorpay' || subscription?.razorpaySubscriptionId) {
      return handlers.razorpay(req, res, next);
    }
    const provider = await configuredProvider();
    if (provider === 'phonepe' && standardPhonePeEnabled()) return handlers.standard(req, res, next);
    if (provider === 'razorpay') return handlers.razorpay(req, res, next);
    return handlers.legacy(req, res, next);
  } catch (error) { return next(error); }
}

router.post('/payment/cancel-subscription', protect, (req, res, next) => accountBillingHandler(req, res, next, {
  standard: standardPhonePe.cancel,
  razorpay: razorpay.cancel,
  legacy: paymentController.cancelSubscription,
}));
router.get('/payment/subscription-status', protect, (req, res, next) => accountBillingHandler(req, res, next, {
  standard: standardPhonePe.status,
  razorpay: razorpay.status,
  legacy: paymentController.subscriptionStatus,
}));
router.get('/payment/verify-app-access', protect, (req, res, next) => accountBillingHandler(req, res, next, {
  standard: standardPhonePe.verifyAccess,
  razorpay: razorpay.status,
  legacy: paymentController.verifyAppAccess,
}));
router.post('/payment/verify-app-access', protect, (req, res, next) => accountBillingHandler(req, res, next, {
  standard: standardPhonePe.verifyAccess,
  razorpay: razorpay.status,
  legacy: paymentController.verifyAppAccess,
}));
router.use(autoPayTestRoutes);

module.exports = router;
