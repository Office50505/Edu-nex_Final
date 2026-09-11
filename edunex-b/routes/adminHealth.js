const express = require('express');
const mongoose = require('mongoose');
const { protectAdmin } = require('../middleware/adminAuth');
const { systemHealth } = require('../services/systemHealthService');
const Course = require('../models/Course');
const RazorpayBilling = require('../models/RazorpayBilling');
const BillingWebhook = require('../models/BillingWebhook');
const router = express.Router();
let inFlight;
let cached;
let cachedAt = 0;
router.get('/system-health', protectAdmin, async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    if (!cached || Date.now() - cachedAt > 10000) {
      if (!inFlight) inFlight = systemHealth({ connection: mongoose.connection, Course, RazorpayBilling, BillingWebhook })
        .then(result => { cached = result; cachedAt = Date.now(); return result; }).finally(() => { inFlight = null; });
      await inFlight;
    }
    res.json(cached);
  } catch {
    res.status(503).json({ error: 'System diagnostics are temporarily unavailable.' });
  }
});
module.exports = router;
