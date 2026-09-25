const mongoose = require('mongoose');

const contactEnquirySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  firstName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80,
  },
  lastName: {
    type: String,
    trim: true,
    maxlength: 80,
    default: '',
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 160,
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 3000,
  },
  status: {
    type: String,
    enum: ['new', 'read', 'replied', 'closed'],
    default: 'new',
  },
  source: {
    type: String,
    default: 'contact-page',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

contactEnquirySchema.index({ email: 1, createdAt: -1 });
contactEnquirySchema.index({ status: 1, createdAt: -1 });
contactEnquirySchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('ContactEnquiry', contactEnquirySchema);
