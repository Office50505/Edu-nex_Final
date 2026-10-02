const mongoose = require('mongoose');
// Reserve the final User id without creating an incomplete login-capable account.
const schema = new mongoose.Schema({
  mobileNumber: { type: String, required: true, unique: true },
  tokenHash: String,
  expiresAt: Date,
  handoffHash: String,
  handoffExpiresAt: Date,
  pendingProfile: {
    _id: false,
    fullName: { type: String, trim: true },
    passwordHash: String,
    gender: { type: String, enum: ['male', 'female', 'other'] },
    age: { type: Number, min: 13, max: 80 },
    avatar: String,
  },
  completedAt: Date,
}, { timestamps: true });
// No TTL deletion: billing/webhooks must survive abandoned profile completion.
module.exports = mongoose.model('OnboardingSession', schema);
