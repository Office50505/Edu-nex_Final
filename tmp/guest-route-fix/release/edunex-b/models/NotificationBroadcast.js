const mongoose = require('mongoose');

const notificationBroadcastSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  body: { type: String, required: true, trim: true, maxlength: 500 },
  type: {
    type: String,
    enum: ['announcement', 'course_new', 'course_update', 'learning', 'subscription', 'maintenance'],
    default: 'announcement',
  },
  audience: { type: String, enum: ['all', 'learners', 'testers'], default: 'all' },
  source: { type: String, enum: ['admin', 'course'], default: 'admin' },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
  recipientCount: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['sending', 'sent', 'failed'], default: 'sending' },
  error: { type: String, trim: true, maxlength: 500, default: null },
  createdBy: { type: String, trim: true, maxlength: 200, default: 'system' },
}, { timestamps: true });

notificationBroadcastSchema.index({ createdAt: -1 });
notificationBroadcastSchema.index({ course: 1, createdAt: -1 });

module.exports = mongoose.model('NotificationBroadcast', notificationBroadcastSchema);
