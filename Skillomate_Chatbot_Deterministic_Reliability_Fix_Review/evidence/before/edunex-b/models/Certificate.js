const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema(
  {
    courseVersion: String,
    totalLessons: Number,
    status: { type: String, enum: ['active', 'revoked'], default: 'active' },
    criteria: mongoose.Schema.Types.Mixed,
    audit: [{ action: String, reason: String, at: Date, actor: String }],
    certificateId: {
      type: String,
      required: true,
      trim: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    courseId: {
      type: String,
      required: true,
      index: true,
    },
    courseTitle: {
      type: String,
      trim: true,
      default: '',
    },
    userName: {
      type: String,
      trim: true,
      default: '',
    },
    userEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    issuedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'certificates',
  }
);

certificateSchema.index(
  { certificateId: 1 },
  { unique: true, partialFilterExpression: { certificateId: { $type: 'string' } } }
);
certificateSchema.index({ userId: 1, courseId: 1 });
certificateSchema.index({ issuedAt: -1 });

module.exports = mongoose.model('Certificate', certificateSchema);
