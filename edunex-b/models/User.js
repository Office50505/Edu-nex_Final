const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  fullName: String,
  email: { type: String, default: null },
  passwordHash: String,
  isOnTrial: { type: Boolean, default: true },
  mobileNumber: { type: String, default: null },
  isMobileVerified: { type: Boolean, default: false },
  avatar: { type: String, trim: true, default: null },
  gender: {
    type: String,
    enum: ['male', 'female', 'other', null],
    default: null,
  },
  age: {
    type: Number,
    min: 5,
    max: 80,
    default: null,
  },
  isEmailVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  bannedAt: { type: Date, default: null },
  banReason: { type: String, trim: true, maxlength: 500, default: null },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: String, trim: true, default: null },
  deletionReason: { type: String, trim: true, maxlength: 500, default: null },
  wasActiveBeforeDeletion: { type: Boolean, default: true },
  phonePeCustomerId: { type: String, default: null },
  subscriptionStatus: {
    type: String,
    enum: ['none', '1rs trial', 'trial', 'active', 'subscribed', 'cancelled', 'expired'],
    default: 'none',
  },
  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription',
    default: null,
  },
  subscriptionExpiry: {
    type: Date,
    default: null,
  },
  purchasedCourses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
  }],
  courseEntitlements: [{
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    accessType: { type: String, enum: ['trial', 'yearly', 'permanent'], default: 'permanent' },
    grantedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null },
  }],
  wishlist: {
    type: [String],
    default: undefined,
  },
  courseProgress: {
    type: mongoose.Schema.Types.Mixed,
    default: undefined,
  },
  deviceToken: { type: String, default: null, select: false },
  marketingOptIn: { type: Boolean, default: false },
  lastActiveAt: { type: Date, default: Date.now },
  lastLoginAt: { type: Date, default: null },
  loginCount: { type: Number, default: 0 },
  activeSessionId: {
    type: String,
    default: null,
    select: false,
  },
  activeSessions: {
    type: [String],
    default: undefined,
    select: false,
  },
  createdAt: { type: Date, default: Date.now }
});

userSchema.index({ isActive: 1, createdAt: -1 });
userSchema.index({ deletedAt: 1, createdAt: -1 });
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } }
);
userSchema.index(
  { mobileNumber: 1 },
  { unique: true, partialFilterExpression: { mobileNumber: { $type: 'string' } } }
);
userSchema.index({ subscriptionStatus: 1, createdAt: -1 });
userSchema.index({ lastActiveAt: -1 });
userSchema.index({ isMobileVerified: 1, createdAt: -1 });
userSchema.index({ isEmailVerified: 1, createdAt: -1 });
userSchema.index({ marketingOptIn: 1, createdAt: -1 });
userSchema.index({ activeSessionId: 1 }, { sparse: true });
userSchema.index({ activeSessions: 1 }, { sparse: true });

module.exports = mongoose.model('User', userSchema);
