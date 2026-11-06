const express = require('express');
const { requireCompatibleAuth } = require('../middleware/compatAuth');
const {
  GOOGLE_PLAY_INTRODUCTORY_OFFER_ID,
  GOOGLE_PLAY_PACKAGE_NAME,
  GOOGLE_PLAY_PRODUCT_ID,
} = require('../services/googlePlayEntitlement');
const { createGooglePlayIapService } = require('../services/googlePlayIapService');
const {
  decodeGooglePlayRtdnMessage,
  verifyGooglePlayPubSubAuthorization,
} = require('../services/googlePlayRtdn');

const router = express.Router();
const service = createGooglePlayIapService();
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
    if (current.count > max) return res.status(429).json({ error: 'Too many Google Play requests. Please try again shortly.' });
    return next();
  };
}

function handler(action) {
  return async (req, res) => {
    try {
      await action(req, res);
    } catch (error) {
      const status = Number(error.statusCode) || 500;
      if (status >= 500) console.error(`Google Play IAP operation failed (${error.code || error.name || 'unknown'})`);
      res.status(status).json({
        error: status >= 500 ? 'Google Play verification is temporarily unavailable. Please try again.' : error.message,
        code: error.code || 'GOOGLE_PLAY_IAP_ERROR',
      });
    }
  };
}

router.get('/google-play-iap/config', requireCompatibleAuth(), handler(async (req, res) => {
  const status = await service.statusForUser(req.compatAuth.userId);
  res.set('Cache-Control', 'no-store');
  res.json({
    ...status,
    // Purchase configuration must not be replaced by an older stored product.
    packageName: GOOGLE_PLAY_PACKAGE_NAME,
    productId: GOOGLE_PLAY_PRODUCT_ID,
    introductoryOfferId: GOOGLE_PLAY_INTRODUCTORY_OFFER_ID,
    managementUrl: `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(GOOGLE_PLAY_PRODUCT_ID)}&package=${encodeURIComponent(GOOGLE_PLAY_PACKAGE_NAME)}`,
  });
}));

router.get('/google-play-iap/status', requireCompatibleAuth(), handler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await service.statusForUser(req.compatAuth.userId));
}));

router.post(
  '/google-play-iap/verify',
  requireCompatibleAuth(),
  rateLimit({ windowMs: 60_000, max: 12 }),
  handler(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await service.verifyClientPurchase(req.compatAuth.userId, req.body?.purchaseToken));
  })
);

router.post(
  '/google-play-iap/notifications',
  rateLimit({ windowMs: 60_000, max: 240 }),
  handler(async (req, res) => {
    await verifyGooglePlayPubSubAuthorization(req.get('authorization'));
    const notification = decodeGooglePlayRtdnMessage(req.body);
    if (!notification.test && !notification.ignored) await service.processDeveloperNotification(notification.purchaseToken);
    res.status(204).end();
  })
);

module.exports = router;
