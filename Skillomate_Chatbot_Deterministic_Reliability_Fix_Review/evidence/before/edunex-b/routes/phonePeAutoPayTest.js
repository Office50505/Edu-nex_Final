const express = require('express');
const { protectAdmin } = require('../middleware/adminAuth');
const controller = require('../controllers/phonePeAutoPayTestController');

const router = express.Router();

function autoPayTestRoutesAllowed(env = process.env) {
  return env.NODE_ENV !== 'production'
    && String(env.PHONEPE_AUTOPAY_TEST_ROUTES_ENABLED || '').trim().toLowerCase() === 'true'
    && String(env.PHONEPE_AUTOPAY_ENABLED || '').trim().toLowerCase() === 'true';
}

function requireAutoPayTestAccess(req, res, next) {
  if (process.env.NODE_ENV === 'production') return res.status(404).json({ error: 'Not found' });
  if (!autoPayTestRoutesAllowed(process.env)) {
    return res.status(503).json({ error: 'PhonePe AutoPay test routes are disabled.' });
  }
  return next();
}

function run(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(error => {
    if (error?.statusCode && error.statusCode < 500) return res.status(error.statusCode).json({ error: error.message });
    if (error?.statusCode === 503) return res.status(503).json({ error: error.message });
    if (error?.statusCode === 502 && error?.providerStatus) {
      console.info(JSON.stringify({
        scope: 'phonepe_autopay_test',
        action: 'provider_error',
        providerStatus: error.providerStatus,
        providerCode: error.providerCode || null,
        providerDetailedCode: error.providerDetailedCode || null,
        providerMessage: error.providerMessage || null,
        timestamp: new Date().toISOString(),
      }));
      return res.status(502).json({
        error: 'PhonePe AutoPay provider request failed.',
        providerStatus: error.providerStatus,
        providerCode: error.providerCode || null,
        providerDetailedCode: error.providerDetailedCode || null,
        providerMessage: error.providerMessage || null,
      });
    }
    console.error('PhonePe AutoPay test request failed safely.');
    return res.status(502).json({ error: 'PhonePe AutoPay test request failed.' });
  });
}

router.post('/admin/phonepe-autopay/test/create-mandate', protectAdmin, requireAutoPayTestAccess, run(controller.createMandate));
router.get('/admin/phonepe-autopay/test/status/:mandateId', protectAdmin, requireAutoPayTestAccess, run(controller.getMandateStatus));
router.post('/admin/phonepe-autopay/test/debit', protectAdmin, requireAutoPayTestAccess, run(controller.executeDebit));
module.exports = router;
module.exports.autoPayTestRoutesAllowed = autoPayTestRoutesAllowed;
module.exports.requireAutoPayTestAccess = requireAutoPayTestAccess;
