const mongoose = require('mongoose');

// Durable token ownership/history and retry inbox. Never include purchaseToken in logs/API responses.
const schema = new mongoose.Schema({
  _id: { type: String, required: true }, // SHA-256 purchase token; unique without a new secondary index.
  purchaseToken: { type: String, required: true, select: false },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // Authenticated submitter only; revalidate the binding against Google before granting access.
  candidateUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  state: { type: String, enum: ['pending', 'unresolved', 'verified', 'blocked'], default: 'pending' },
  reason: { type: String, default: null },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  generation: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
schema.index({ state: 1, nextAttemptAt: 1 });
module.exports = mongoose.model('GooglePlayReconciliation', schema);
