const mongoose = require('mongoose');

const appleTransactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  retainedAccountHash: { type: String, default: null, index: true },
  accountDeletedAt: { type: Date, default: null },
  transactionId: { type: String, required: true, unique: true },
  originalTransactionId: { type: String, required: true },
  productId: { type: String, required: true },
  environment: { type: String, default: null },
  purchaseDate: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
  revocationDate: { type: Date, default: null },
  transactionReason: { type: String, default: null },
  recordedAt: { type: Date, default: Date.now },
});

appleTransactionSchema.index({ user: 1, recordedAt: -1 });
appleTransactionSchema.index({ originalTransactionId: 1, recordedAt: -1 });

module.exports = mongoose.model('AppleTransaction', appleTransactionSchema);
