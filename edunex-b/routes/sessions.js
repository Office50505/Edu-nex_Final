const express = require('express');
const { protect } = require('../middleware/auth');
const Session = require('../models/Session');
const User = require('../models/User');

const router = express.Router();
const SESSION_PLATFORMS = new Set(['ios', 'android', 'web', 'windows', 'macos']);

function compact(value, max) {
  return String(value || '').trim().slice(0, max);
}

router.patch('/sessions/ping', protect, async (req, res) => {
  try {
    const platform = compact(req.body?.platform || req.headers['x-platform'] || 'web', 20).toLowerCase();
    const sessionId = req.authSessionId;
    const now = new Date();

    if (!SESSION_PLATFORMS.has(platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }

    const sessionMetadata = {
      platform,
      deviceName: compact(req.body?.deviceName || req.headers['x-device-name'], 120),
      deviceModel: compact(req.body?.deviceModel || req.headers['x-device-model'], 120),
      osVersion: compact(req.body?.osVersion || req.headers['x-os-version'], 80),
      appVersion: compact(req.body?.appVersion || req.headers['x-app-version'], 80),
      appBuild: compact(req.body?.appBuild || req.headers['x-app-build'], 80),
      lastPingAt: now,
      loggedOutAt: null,
    };
    if (req.body?.deviceToken) sessionMetadata.deviceToken = compact(req.body.deviceToken, 500);

    await User.findByIdAndUpdate(req.user._id, { lastActiveAt: now });
    await Session.findOneAndUpdate(
      { user: req.user._id, sessionId },
      {
        $set: {
          ...sessionMetadata,
        },
        $setOnInsert: {
          user: req.user._id,
          sessionId,
          loggedInAt: now,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({ ok: true, recordedAt: now });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
