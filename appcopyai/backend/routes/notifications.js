const express = require('express');
const Notification = require('../models/Notification');
const { requireCompatibleAuth } = require('../middleware/compatAuth');

const router = express.Router();

function publicNotification(row) {
  return {
    _id: String(row._id),
    id: String(row._id),
    type: row.type || 'update',
    channel: row.channel || 'push',
    title: row.title || '',
    body: row.body || '',
    isRead: row.isRead === true,
    createdAt: row.createdAt,
  };
}

router.get('/notifications', requireCompatibleAuth(), async (req, res) => {
  try {
    const userId = req.compatAuth.userId;
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const [rows, unreadCount] = await Promise.all([
      Notification.find({ recipient: userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      Notification.countDocuments({ recipient: userId, isRead: false }),
    ]);

    res.json({
      notifications: rows.map(publicNotification),
      unreadCount,
    });
  } catch (error) {
    res.status(500).json({ error: 'Could not load notifications' });
  }
});

router.patch('/notifications/read', requireCompatibleAuth(), async (req, res) => {
  try {
    const userId = req.compatAuth.userId;
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.map(String).filter(Boolean)
      : [];
    const filter = { recipient: userId, isRead: false };
    if (ids.length) filter._id = { $in: ids };

    const result = await Notification.updateMany(filter, { $set: { isRead: true } });
    res.json({ ok: true, modifiedCount: result.modifiedCount || 0 });
  } catch (error) {
    res.status(500).json({ error: 'Could not update notifications' });
  }
});

module.exports = router;
