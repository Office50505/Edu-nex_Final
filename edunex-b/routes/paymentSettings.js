const router = require('express').Router();
const { protectAdmin } = require('../middleware/adminAuth');
const modes = require('../services/paymentMode');
const run = fn => async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try { res.json(await fn(req)); }
  catch (error) { res.status(error.status || 503).json({ error: error.status ? error.message : 'Payment settings are temporarily unavailable.' }); }
};
router.get('/payment-settings', protectAdmin, run(() => modes.summary()));
router.put('/payment-settings', protectAdmin, run(req => {
  if (!['test', 'live'].includes(req.body?.mode)) throw Object.assign(new Error('Choose test or live payment mode.'), { status: 400 });
  return modes.select(req.body.mode, req.admin);
}));
module.exports = router;
