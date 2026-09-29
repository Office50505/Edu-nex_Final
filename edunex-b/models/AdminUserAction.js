const mongoose = require('mongoose');

const adminUserActionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  action: {
    type: String,
    enum: ['user_banned', 'user_unbanned', 'password_reset', 'subscription_granted', 'subscription_revoked', 'course_granted', 'course_revoked', 'user_trashed', 'user_restored', 'tester_enabled', 'tester_disabled'],
    required: true,
    index: true,
  },
  reason: { type: String, trim: true, maxlength: 500, default: null },
  previousState: { type: mongoose.Schema.Types.Mixed, default: null },
  nextState: { type: mongoose.Schema.Types.Mixed, default: null },
  adminSubject: { type: String, trim: true, default: 'admin' },
  createdAt: { type: Date, default: Date.now, index: true },
});

adminUserActionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('AdminUserAction', adminUserActionSchema);
