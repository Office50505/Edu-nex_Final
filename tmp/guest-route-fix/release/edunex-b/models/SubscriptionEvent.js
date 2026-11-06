const mongoose = require('mongoose');

const subscriptionEventSchema = new mongoose.Schema({
  subscription: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  event: {
    type: String,
    enum: [
      'MANDATE_CREATED',
      'MANDATE_APPROVED',
      'MANDATE_REJECTED',
      'MANDATE_REVOKED',
      'PAYMENT_SUCCESS',
      'PAYMENT_FAILED',
      'PAYMENT_PENDING',
      'SUBSCRIPTION_ACTIVATED',
      'SUBSCRIPTION_CANCELLED',
      'SUBSCRIPTION_PAUSED',
      'SUBSCRIPTION_RESUMED',
    ],
    required: true,
  },
  amount: { type: Number, default: null },
  phonePeTransactionId: { type: String, default: null },
  phonePeMerchantTransactionId: { type: String, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
});

subscriptionEventSchema.index({ subscription: 1 });
subscriptionEventSchema.index({ user: 1, event: 1 });
subscriptionEventSchema.index({ createdAt: 1 });
subscriptionEventSchema.index(
  { phonePeTransactionId: 1 },
  { unique: true, sparse: true }
);

module.exports = mongoose.model('SubscriptionEvent', subscriptionEventSchema);
