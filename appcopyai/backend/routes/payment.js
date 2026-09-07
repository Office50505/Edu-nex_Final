const express = require('express');
const { protect } = require('../middleware/auth');
const paymentController = require('../controllers/paymentController');

const router = express.Router();

router.post('/payment/initiate-trial', protect, paymentController.initiateTrial);
router.get('/payment/simulate', paymentController.renderPaymentSimulator);
router.post('/payment/simulate/complete', paymentController.completeSimulatedPayment);
router.get('/payment/callback', paymentController.paymentCallback);
router.post('/webhooks/phonepe', paymentController.handleWebhook);
router.post('/payment/cancel-subscription', protect, paymentController.cancelSubscription);
router.get('/payment/subscription-status', protect, paymentController.subscriptionStatus);
router.get('/payment/verify-app-access', protect, paymentController.verifyAppAccess);
router.post('/payment/verify-app-access', protect, paymentController.verifyAppAccess);

module.exports = router;
