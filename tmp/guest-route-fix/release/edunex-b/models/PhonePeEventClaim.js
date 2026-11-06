const mongoose = require('mongoose');

const phonePeEventClaimSchema = new mongoose.Schema({
  eventKey: { type: String, required: true },
  source: { type: String, enum: ['callback', 'webhook'], required: true },
  eventType: { type: String, required: true },
  status: { type: String, enum: ['processing', 'processed', 'failed'], required: true },
  leaseToken: { type: String, required: true },
  leaseExpiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  processedAt: { type: Date, default: null },
  lastFailureCode: { type: String, default: null },
}, { timestamps: true });

phonePeEventClaimSchema.index({ eventKey: 1 }, { unique: true, name: 'phonepe_event_key_unique' });
phonePeEventClaimSchema.index({ status: 1, leaseExpiresAt: 1 });

module.exports = mongoose.model('PhonePeEventClaim', phonePeEventClaimSchema);
