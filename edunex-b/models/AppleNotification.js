const mongoose = require('mongoose');

const appleNotificationSchema = new mongoose.Schema({
  notificationUUID: { type: String, required: true, unique: true },
  notificationType: { type: String, default: null },
  subtype: { type: String, default: null },
  signedDate: { type: Date, default: null },
  environment: { type: String, default: null },
  originalTransactionId: { type: String, default: null },
  processed: { type: Boolean, default: false },
  processingNote: { type: String, maxlength: 300, default: null },
  receivedAt: { type: Date, default: Date.now },
});

appleNotificationSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 400 });

module.exports = mongoose.model('AppleNotification', appleNotificationSchema);
