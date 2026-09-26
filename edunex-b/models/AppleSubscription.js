const mongoose = require('mongoose');

const STATES = [
  'ACTIVE',
  'ACTIVE_CANCELS_AT_PERIOD_END',
  'GRACE_PERIOD',
  'BILLING_RETRY',
  'EXPIRED',
  'REVOKED',
  'REFUNDED',
  'NONE',
  'UNKNOWN',
];

const appleSubscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  appAccountToken: { type: String, required: true, unique: true, immutable: true },
  productId: { type: String, default: null },
  originalTransactionId: { type: String, default: null },
  latestTransactionId: { type: String, default: null },
  environment: { type: String, enum: ['Production', 'Sandbox', 'Xcode', 'LocalTesting', null], default: null },
  entitlementState: { type: String, enum: STATES, default: 'NONE' },
  entitlementActive: { type: Boolean, default: false },
  purchasedAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
  gracePeriodExpiresAt: { type: Date, default: null },
  autoRenewEnabled: { type: Boolean, default: null },
  billingRetry: { type: Boolean, default: false },
  revokedAt: { type: Date, default: null },
  lastVerifiedAt: { type: Date, default: null },
  lastNotificationType: { type: String, default: null },
  lastNotificationSubtype: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

appleSubscriptionSchema.index(
  { originalTransactionId: 1 },
  { unique: true, partialFilterExpression: { originalTransactionId: { $type: 'string' } } }
);
appleSubscriptionSchema.index({ entitlementState: 1, expiresAt: 1 });

module.exports = mongoose.model('AppleSubscription', appleSubscriptionSchema);
module.exports.APPLE_ENTITLEMENT_STATES = STATES;
