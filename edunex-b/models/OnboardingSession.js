const mongoose = require('mongoose');
// Reserve the final User id without creating an incomplete login-capable account.
const schema = new mongoose.Schema({
  mobileNumber: { type: String, required: true, unique: true },
  tokenHash: String,
  expiresAt: Date,
  handoffHash: String,
  handoffExpiresAt: Date,
  completedAt: Date,
}, { timestamps: true });
// No TTL deletion: billing/webhooks must survive abandoned profile completion.
module.exports = mongoose.model('OnboardingSession', schema);
