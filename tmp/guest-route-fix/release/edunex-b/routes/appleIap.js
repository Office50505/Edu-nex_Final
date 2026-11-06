const express = require('express');
const { requireCompatibleAuth } = require('../middleware/compatAuth');
const { APPLE_PRODUCT_ID } = require('../services/appleEntitlement');
const { createAppleIapService } = require('../services/appleIapService');

const router = express.Router();
const service = createAppleIapService();
const attempts = new Map();

function rateLimit({ windowMs, max }) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.compatAuth?.userId || 'anonymous'}`;
    const current = attempts.get(key);
    const now = Date.now();
    if (!current || current.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    current.count += 1;
    if (current.count > max) return res.status(429).json({ error: 'Too many App Store requests. Please try again shortly.' });
    return next();
  };
}

function handler(action) {
  return async (req, res) => {
    try {
      await action(req, res);
    } catch (error) {
      const status = Number(error.statusCode) || 500;
      if (status >= 500) console.error(`Apple IAP operation failed (${error.code || error.name || 'unknown'})`);
      res.status(status).json({
        error: status >= 500 ? 'App Store verification is temporarily unavailable. Please try again.' : error.message,
        code: error.code || 'APPLE_IAP_ERROR',
      });
    }
  };
}

router.get('/apple-iap/config', requireCompatibleAuth(), handler(async (req, res) => {
  const status = await service.statusForUser(req.compatAuth.userId);
  res.set('Cache-Control', 'no-store');
  res.json({ productId: APPLE_PRODUCT_ID, ...status });
}));

router.get('/apple-iap/status', requireCompatibleAuth(), handler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await service.statusForUser(req.compatAuth.userId));
}));

router.post(
  '/apple-iap/verify',
  requireCompatibleAuth(),
  rateLimit({ windowMs: 60_000, max: 12 }),
  handler(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await service.verifyClientTransaction(req.compatAuth.userId, req.body?.signedTransaction));
  })
);

router.post(
  '/apple-iap/notifications',
  rateLimit({ windowMs: 60_000, max: 240 }),
  handler(async (req, res) => {
    await service.processNotification(req.body?.signedPayload);
    res.sendStatus(200);
  })
);

module.exports = router;
