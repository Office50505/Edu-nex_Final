const mongoose = require('mongoose');

const billingCancellationJobSchema = new mongoose.Schema({
  accountReferenceHash: { type: String, required: true, index: true },
  provider: { type: String, enum: ['razorpay', 'phonepe', 'apple', 'mixed', 'unknown'], default: 'unknown' },
  providerReferenceIds: { type: [String], default: [] },
  cancellationTargets: [{
    provider: { type: String, enum: ['razorpay', 'phonepe'] },
    referenceId: { type: String, required: true },
    mode: { type: String, enum: ['test', 'live', null], default: null },
  }],
  status: { type: String, enum: ['pending', 'retrying', 'resolved', 'manual_review'], default: 'pending' },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now, index: true },
  lastErrorCode: { type: String, maxlength: 120, default: null },
  lastErrorAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('BillingCancellationJob', billingCancellationJobSchema);
