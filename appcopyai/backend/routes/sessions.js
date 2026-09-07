const express = require('express');
const { protect } = require('../middleware/auth');
const Session = require('../models/Session');
const User = require('../models/User');

const router = express.Router();

router.patch('/sessions/ping', protect, async (req, res) => {
  try {
    const platform = req.body.platform || req.headers['x-platform'] || 'web';
    const sessionId = req.authSessionId;
    const now = new Date();

    if (!['ios', 'android', 'web', 'windows', 'macos'].includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }

    await User.findByIdAndUpdate(req.user._id, { lastActiveAt: now });
    await Session.findOneAndUpdate(
      { user: req.user._id, sessionId },
      {
        $set: {
          platform,
          lastPingAt: now,
          loggedOutAt: null,
          deviceToken: req.body.deviceToken || null,
        },
        $setOnInsert: {
          user: req.user._id,
          sessionId,
          loggedInAt: now,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.sendStatus(200);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
