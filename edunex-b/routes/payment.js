const express = require('express');
const { protect } = require('../middleware/auth');
const paymentController = require('../controllers/paymentController');

const router = express.Router();
const razorpay = require('../controllers/razorpayController');
const useRazorpay = (modern, legacy) => (req, res, next) => (process.env.PAYMENT_GATEWAY_MODE === 'razorpay' ? modern : legacy)(req, res, next);
router.get('/payment/config', razorpay.pricing);
router.post('/payment/razorpay/verify', protect, razorpay.verify);
router.post('/webhooks/razorpay', razorpay.webhook);

router.post('/payment/initiate-trial', protect, useRazorpay(razorpay.initiate, paymentController.initiateTrial));
router.get('/payment/simulate', paymentController.renderPaymentSimulator);
router.post('/payment/simulate/complete', paymentController.completeSimulatedPayment);
router.get('/payment/callback', paymentController.paymentCallback);
router.post('/webhooks/phonepe', paymentController.handleWebhook);
router.post('/payment/cancel-subscription', protect, useRazorpay(razorpay.cancel, paymentController.cancelSubscription));
router.get('/payment/subscription-status', protect, useRazorpay(razorpay.status, paymentController.subscriptionStatus));
router.get('/payment/verify-app-access', protect, useRazorpay(razorpay.status, paymentController.verifyAppAccess));
router.post('/payment/verify-app-access', protect, useRazorpay(razorpay.status, paymentController.verifyAppAccess));

module.exports = router;
