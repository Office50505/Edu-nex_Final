const mongoose = require('mongoose');

const problemReportSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  reporterName: {
    type: String,
    trim: true,
    maxlength: 160,
    default: '',
  },
  reporterEmail: {
    type: String,
    trim: true,
    lowercase: true,
    maxlength: 160,
    default: '',
  },
  category: {
    type: String,
    enum: ['technical', 'video', 'payment', 'ai', 'account', 'other'],
    required: true,
  },
  message: {
    type: String,
    required: true,
    trim: true,
    minlength: 10,
    maxlength: 3000,
  },
  pageUrl: { type: String, trim: true, maxlength: 2048, default: '' },
  pageTitle: { type: String, trim: true, maxlength: 240, default: '' },
  route: { type: String, trim: true, maxlength: 800, default: '' },
  courseId: { type: String, trim: true, maxlength: 120, default: '' },
  lessonId: { type: String, trim: true, maxlength: 120, default: '' },
  theme: {
    type: String,
    enum: ['light', 'noir', 'system', 'unknown'],
    default: 'unknown',
  },
  viewport: {
    width: { type: Number, min: 0, max: 10000, default: 0 },
    height: { type: Number, min: 0, max: 10000, default: 0 },
  },
  deviceType: {
    type: String,
    enum: ['mobile', 'tablet', 'desktop', 'unknown'],
    default: 'unknown',
  },
  userAgent: { type: String, trim: true, maxlength: 600, default: '' },
  status: {
    type: String,
    enum: ['new', 'in_progress', 'resolved', 'closed'],
    default: 'new',
  },
  adminNote: { type: String, trim: true, maxlength: 2000, default: '' },
  resolvedAt: { type: Date, default: null },
  updatedBy: { type: String, trim: true, maxlength: 160, default: '' },
}, { timestamps: true });

problemReportSchema.index({ status: 1, createdAt: -1 });
problemReportSchema.index({ category: 1, createdAt: -1 });
problemReportSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('ProblemReport', problemReportSchema);
