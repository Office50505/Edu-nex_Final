const mongoose = require('mongoose');

const aiResponseReportSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  messageId: { type: String, required: true, maxlength: 120 },
  reason: {
    type: String,
    enum: ['incorrect', 'harmful_or_unsafe', 'inappropriate', 'privacy_concern', 'other'],
    required: true,
  },
  responseHash: { type: String, maxlength: 64, default: null },
  createdAt: { type: Date, default: Date.now, index: true },
  status: { type: String, enum: ['open', 'reviewed', 'resolved'], default: 'open' },
});

aiResponseReportSchema.index({ user: 1, messageId: 1, reason: 1 }, { unique: true });

module.exports = mongoose.model('AiResponseReport', aiResponseReportSchema);
