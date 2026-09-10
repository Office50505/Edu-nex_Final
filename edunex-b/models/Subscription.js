const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  gateway: { type: String, default: 'phonepe' },
  razorpaySubscriptionId: String,
  razorpayStatus: String,
  phonePeMerchantId: { type: String, required: true },
  phonePeSubscriptionId: { type: String, default: null },
  phonePeMandateId: { type: String, default: null },
  phonePeAuthRequestId: { type: String, default: null },
  status: {
    type: String,
    enum: ['pending', '1rs trial', 'trial', 'active', 'subscribed', 'cancelled', 'expired', 'paused'],
    default: 'trial',
  },
  trialStartedAt: { type: Date, default: null },
  trialExpiresAt: { type: Date, default: null },
  trialConverted: { type: Boolean, default: false },
  t6hNotifiedAt: { type: Date, default: null },
  t1hNotifiedAt: { type: Date, default: null },
  currentPeriodStart: { type: Date, default: null },
  currentPeriodEnd: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  cancelReason: { type: String, default: null },
  amount: { type: Number, default: 50000 },
  subscriptionType: { type: String, enum: ['trial', 'monthly'], default: 'trial' },
  frequency: { type: String, default: 'monthly' },
  nextBillingAt: { type: Date, default: null },
  coupon: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', default: null },
  createdAt: { type: Date, default: Date.now },
});

subscriptionSchema.index({ status: 1 });
subscriptionSchema.index({ trialExpiresAt: 1 });
subscriptionSchema.index({ nextBillingAt: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
