const mongoose = require('mongoose');

const cycleSchema = new mongoose.Schema({
  sequence: { type: Number, min: 1 },
  merchantOrderId: { type: String, default: null },
  phonePeOrderId: { type: String, default: null },
  notifyState: { type: String, default: null },
  notifiedAt: { type: Date, default: null },
  validAfter: { type: Date, default: null },
  validUpto: { type: Date, default: null },
  redeemState: { type: String, default: null },
  phonePeTransactionId: { type: String, default: null },
  executeRequestedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  failureCode: { type: String, default: null },
}, { _id: false });

const schema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  phase: {
    type: String,
    enum: ['creating', 'setup_pending', 'active', 'cancel_pending', 'cancelled', 'failed', 'uncertain'],
    required: true,
  },
  mode: { type: String, enum: ['sandbox', 'live'], required: true },
  paymentType: { type: String, enum: ['trial', 'monthly'], required: true },
  attempt: { type: String, required: true },
  merchantSubscriptionId: { type: String, default: null },
  setupMerchantOrderId: { type: String, default: null },
  phonePeOrderId: { type: String, default: null },
  phonePeSubscriptionId: { type: String, default: null },
  approvalUrl: { type: String, default: null },
  setupAmount: { type: Number, enum: [100, 49900], required: true },
  recurringAmount: { type: Number, enum: [49900], default: 49900 },
  providerState: { type: String, default: null },
  trialStartedAt: { type: Date, default: null },
  trialEndsAt: { type: Date, default: null },
  nextBillingAt: { type: Date, default: null },
  currentCycle: { type: cycleSchema, default: null },
  lastCompletedMerchantOrderId: { type: String, default: null },
  cancelledAt: { type: Date, default: null },
  cancelRequestedAt: { type: Date, default: null },
  lease: { type: String, default: null },
  leaseUntil: { type: Date, default: null },
}, { timestamps: true });

schema.index({ merchantSubscriptionId: 1 }, {
  unique: true,
  partialFilterExpression: { merchantSubscriptionId: { $type: 'string' } },
});
schema.index({ setupMerchantOrderId: 1 }, {
  unique: true,
  partialFilterExpression: { setupMerchantOrderId: { $type: 'string' } },
});
schema.index({ 'currentCycle.merchantOrderId': 1 }, {
  unique: true,
  partialFilterExpression: { 'currentCycle.merchantOrderId': { $type: 'string' } },
});
schema.index({ phase: 1, nextBillingAt: 1 });

module.exports = mongoose.model('PhonePeAutoPayBilling', schema);
