const mongoose = require('mongoose');

const STATES = [
  'ACTIVE',
  'ACTIVE_CANCELS_AT_PERIOD_END',
  'GRACE_PERIOD',
  'BILLING_RETRY',
  'EXPIRED',
  'REVOKED',
  'NONE',
  'UNKNOWN',
];

const googlePlaySubscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  purchaseToken: { type: String, required: true, select: false },
  purchaseTokenHash: { type: String, required: true, unique: true },
  productId: { type: String, required: true },
  packageName: { type: String, required: true },
  basePlanId: { type: String, default: null },
  offerId: { type: String, default: null },
  latestOrderId: { type: String, default: null },
  subscriptionState: { type: String, default: null },
  acknowledgementState: { type: String, default: null },
  entitlementState: { type: String, enum: STATES, default: 'NONE' },
  entitlementActive: { type: Boolean, default: false },
  expiresAt: { type: Date, default: null },
  autoRenewEnabled: { type: Boolean, default: null },
  lastVerifiedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

googlePlaySubscriptionSchema.index({ entitlementState: 1, expiresAt: 1 });

module.exports = mongoose.model('GooglePlaySubscription', googlePlaySubscriptionSchema);
module.exports.GOOGLE_PLAY_ENTITLEMENT_STATES = STATES;
