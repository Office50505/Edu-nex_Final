const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sessionId: { type: String, required: true, select: false },
  platform: {
    type: String,
    enum: ['ios', 'android', 'web', 'windows', 'macos'],
    required: true,
  },
  deviceName: { type: String, trim: true, default: '' },
  deviceModel: { type: String, trim: true, default: '' },
  osVersion: { type: String, trim: true, default: '' },
  appVersion: { type: String, trim: true, default: '' },
  appBuild: { type: String, trim: true, default: '' },
  deviceToken: { type: String, trim: true, default: null, select: false },
  refreshTokenHash: { type: String, trim: true, default: null, select: false },
  ipAddress: { type: String, trim: true, default: '' },
  userAgent: { type: String, trim: true, default: '' },
  loggedInAt: { type: Date, default: Date.now },
  lastPingAt: { type: Date, default: Date.now },
  loggedOutAt: { type: Date, default: null },
});

sessionSchema.index({ user: 1 });
sessionSchema.index({ user: 1, loggedOutAt: 1 });
sessionSchema.index(
  { sessionId: 1 },
  { unique: true, partialFilterExpression: { sessionId: { $type: 'string' } } }
);
sessionSchema.index({ lastPingAt: 1 });
sessionSchema.index({ platform: 1, lastPingAt: -1 });
sessionSchema.index({ user: 1, platform: 1, lastPingAt: -1 });

module.exports = mongoose.model('Session', sessionSchema);
