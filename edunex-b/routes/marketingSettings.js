const router = require('express').Router();
const { protectAdmin } = require('../middleware/adminAuth');
const marketing = require('../services/marketingSettings');

const run = fn => async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try { res.json(await fn(req)); }
  catch (error) { res.status(error.status || 503).json({ error: error.status ? error.message : 'Marketing settings are temporarily unavailable.' }); }
};

router.get('/marketing-config', run(() => marketing.publicConfig()));
router.get('/admin/marketing-settings', protectAdmin, run(() => marketing.summary()));
router.put('/admin/marketing-settings', protectAdmin, run(req => marketing.save(req.body || {}, req.admin)));

module.exports = router;
