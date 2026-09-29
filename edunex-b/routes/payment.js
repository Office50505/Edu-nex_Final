const express = require('express');
const { protect } = require('../middleware/auth');
const paymentController = require('../controllers/paymentController');

const router = express.Router();
const razorpay = require('../controllers/razorpayController');
const { newCheckoutProvider } = require('../services/phonePePolicy');
const modes = require('../services/paymentMode');

async function configuredProvider() {
  const provider = await modes.activeProvider();
  if (provider === 'phonepe') {
    return newCheckoutProvider({ ...process.env, PAYMENT_GATEWAY_MODE: 'phonepe', PHONEPE_ENABLED: 'true', PHONEPE_NEW_PAYMENTS_ENABLED: 'true' });
  }
  if (provider === 'razorpay') return 'razorpay';
  return 'disabled';
}

const useConfiguredPaymentProvider = (modern, legacy) => async (req, res, next) => {
  const provider = await configuredProvider();
  if (provider === 'razorpay') return modern(req, res, next);
  if (provider === 'phonepe' || provider === 'simulated') return legacy(req, res, next);
  return res.status(503).json({ error: 'Payment service is unavailable.' });
};
router.get('/payment/config', razorpay.pricing);
router.post('/payment/razorpay/verify', protect, razorpay.verify);
router.post('/webhooks/razorpay', razorpay.webhook);

router.post('/payment/initiate-trial', protect, async (req, res, next) => {
  const provider = await configuredProvider();
  if (provider === 'razorpay') return razorpay.initiate(req, res, next);
  if (provider === 'phonepe' || provider === 'simulated') return paymentController.initiateTrial(req, res, next);
  return res.status(503).json({ error: 'Payment checkout is unavailable.' });
});
router.get('/payment/simulate', paymentController.renderPaymentSimulator);
router.post('/payment/simulate/complete', paymentController.completeSimulatedPayment);
router.get('/payment/callback', paymentController.paymentCallback);
router.post('/webhooks/phonepe', paymentController.handleWebhook);
router.post('/payment/cancel-subscription', protect, useConfiguredPaymentProvider(razorpay.cancel, paymentController.cancelSubscription));
router.get('/payment/subscription-status', protect, useConfiguredPaymentProvider(razorpay.status, paymentController.subscriptionStatus));
router.get('/payment/verify-app-access', protect, useConfiguredPaymentProvider(razorpay.status, paymentController.verifyAppAccess));
router.post('/payment/verify-app-access', protect, useConfiguredPaymentProvider(razorpay.status, paymentController.verifyAppAccess));

module.exports = router;
