const express = require('express');
const User = require('../models/User');
const NotificationBroadcast = require('../models/NotificationBroadcast');
const { protectAdmin } = require('../middleware/adminAuth');
const { broadcastNotification, publicBroadcast } = require('../services/notificationService');

const router = express.Router();

router.get('/notifications/broadcasts', protectAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const activeFilter = { isActive: { $ne: false }, deletedAt: null };
    const [all, learners, testers, rows] = await Promise.all([
      User.countDocuments(activeFilter),
      User.countDocuments({ ...activeFilter, isTester: { $ne: true } }),
      User.countDocuments({ ...activeFilter, isTester: true }),
      NotificationBroadcast.find().sort({ createdAt: -1 }).limit(limit).lean(),
    ]);

    res.json({
      audiences: { all, learners, testers },
      broadcasts: rows.map(publicBroadcast),
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to load notification broadcasts.' });
  }
});

router.post('/notifications/broadcast', protectAdmin, async (req, res) => {
  try {
    const result = await broadcastNotification({
      title: req.body?.title,
      body: req.body?.body,
      type: req.body?.type,
      audience: req.body?.audience,
      source: 'admin',
      createdBy: req.admin?.sub || req.admin?.email || 'admin',
    });
    res.status(201).json({
      message: `Notification sent to ${result.recipientCount} active account${result.recipientCount === 1 ? '' : 's'}.`,
      ...result,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Unable to broadcast the notification.' });
  }
});

module.exports = router;
