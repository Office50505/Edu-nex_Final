const User = require('../models/User');
const Notification = require('../models/Notification');
const NotificationBroadcast = require('../models/NotificationBroadcast');

const ALLOWED_TYPES = new Set(['announcement', 'course_new', 'course_update', 'learning', 'subscription', 'maintenance']);
const ALLOWED_AUDIENCES = new Set(['all', 'learners', 'testers']);
const INSERT_BATCH_SIZE = 1000;

function audienceFilter(audience) {
  const filter = { isActive: { $ne: false }, deletedAt: null };
  if (audience === 'learners') filter.isTester = { $ne: true };
  if (audience === 'testers') filter.isTester = true;
  return filter;
}

function cleanText(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function publicBroadcast(row) {
  return {
    id: String(row._id),
    title: row.title,
    body: row.body,
    type: row.type,
    audience: row.audience,
    source: row.source,
    course: row.course ? String(row.course) : null,
    recipientCount: Number(row.recipientCount || 0),
    status: row.status,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

function createNotificationService({
  UserModel = User,
  NotificationModel = Notification,
  BroadcastModel = NotificationBroadcast,
} = {}) {
  async function broadcastNotification({
    title,
    body,
    type = 'announcement',
    audience = 'all',
    source = 'admin',
    courseId = null,
    createdBy = 'system',
  }) {
    const normalizedTitle = cleanText(title, 120);
    const normalizedBody = cleanText(body, 500);
    const normalizedType = String(type || '').trim().toLowerCase();
    const normalizedAudience = String(audience || '').trim().toLowerCase();

    if (normalizedTitle.length < 3) throw Object.assign(new Error('Notification title must contain at least 3 characters.'), { statusCode: 400 });
    if (normalizedBody.length < 3) throw Object.assign(new Error('Notification message must contain at least 3 characters.'), { statusCode: 400 });
    if (!ALLOWED_TYPES.has(normalizedType)) throw Object.assign(new Error('Choose a valid notification type.'), { statusCode: 400 });
    if (!ALLOWED_AUDIENCES.has(normalizedAudience)) throw Object.assign(new Error('Choose a valid notification audience.'), { statusCode: 400 });

    const broadcast = await BroadcastModel.create({
      title: normalizedTitle,
      body: normalizedBody,
      type: normalizedType,
      audience: normalizedAudience,
      source: source === 'course' ? 'course' : 'admin',
      course: courseId || null,
      createdBy: cleanText(createdBy, 200) || 'system',
      status: 'sending',
    });

    let recipientCount = 0;
    try {
      const recipientIds = await UserModel.distinct('_id', audienceFilter(normalizedAudience));
      for (let index = 0; index < recipientIds.length; index += INSERT_BATCH_SIZE) {
        const batch = recipientIds.slice(index, index + INSERT_BATCH_SIZE).map((recipient) => ({
          recipient,
          broadcast: broadcast._id,
          course: courseId || null,
          type: normalizedType,
          channel: 'push',
          title: normalizedTitle,
          body: normalizedBody,
          isRead: false,
        }));
        if (batch.length) await NotificationModel.insertMany(batch, { ordered: false });
        recipientCount += batch.length;
      }

      broadcast.recipientCount = recipientCount;
      broadcast.status = 'sent';
      broadcast.error = null;
      await broadcast.save();
      return { broadcast: publicBroadcast(broadcast), recipientCount };
    } catch (error) {
      broadcast.recipientCount = recipientCount;
      broadcast.status = 'failed';
      broadcast.error = cleanText(error?.message || 'Notification delivery failed.', 500);
      await broadcast.save().catch(() => {});
      throw error;
    }
  }

  return { broadcastNotification };
}

module.exports = {
  ALLOWED_AUDIENCES,
  ALLOWED_TYPES,
  audienceFilter,
  createNotificationService,
  publicBroadcast,
  ...createNotificationService(),
};
