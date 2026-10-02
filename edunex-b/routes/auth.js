const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Session = require('../models/Session');
const { protect } = require('../middleware/auth');
const { requireCompatibleAuth } = require('../middleware/compatAuth');
const { sensitiveRateLimit } = require('../middleware/sensitiveRateLimit');
const { deleteUserAccount } = require('../services/accountDeletionService');
const {
  OTP_LENGTH,
  normalizeMobileNumber,
  sendMobileOtp,
  resendMobileOtp,
  verifyMobileOtp: verifyMobileOtpCode,
} = require('../services/otpService');
const { isAuthRateLimitDisabled } = require('../services/rateLimitToggle');

const router = express.Router();
const isProduction = process.env.NODE_ENV === 'production';
function envSecret(name, developmentFallback) {
  const value = process.env[name];
  if (!value && isProduction) {
    throw new Error(`${name} must be set in production`);
  }
  return value || developmentFallback;
}

const ACCESS_TOKEN_SECRET = envSecret('JWT_SECRET', 'edunex-development-access-secret');
const REFRESH_TOKEN_SECRET = envSecret('JWT_REFRESH_SECRET', 'edunex-development-refresh-secret');
const SIGNUP_TOKEN_SECRET = envSecret('JWT_SIGNUP_SECRET', 'edunex-development-signup-secret');
const realOtp = (process.env.OTP_PROVIDER || process.env.OTP_DELIVERY_PROVIDER || (isProduction ? 'msg91' : 'demo')).toLowerCase() === 'msg91';
const AUTO_VERIFY_OTP = !isProduction && !realOtp && process.env.AUTO_VERIFY_OTP === 'true';

const authRateBuckets = new Map();
const authRateConfig = {
  loginByPhone: isProduction
    ? { windowMs: 15 * 60 * 1000, maxAttempts: 5, blockDurationMs: 15 * 60 * 1000 }
    : { windowMs: 5 * 60 * 1000, maxAttempts: 50, blockDurationMs: 60 * 1000 },
  loginByIp: isProduction
    ? { windowMs: 15 * 60 * 1000, maxAttempts: 20, blockDurationMs: 15 * 60 * 1000 }
    : { windowMs: 5 * 60 * 1000, maxAttempts: 150, blockDurationMs: 60 * 1000 },
  otpByPhone: (isProduction || realOtp)
    ? { windowMs: 60 * 60 * 1000, maxAttempts: 5, blockDurationMs: 60 * 60 * 1000 }
    : { windowMs: 5 * 60 * 1000, maxAttempts: 50, blockDurationMs: 60 * 1000 },
  otpByIp: (isProduction || realOtp)
    ? { windowMs: 60 * 60 * 1000, maxAttempts: 15, blockDurationMs: 60 * 60 * 1000 }
    : { windowMs: 5 * 60 * 1000, maxAttempts: 150, blockDurationMs: 60 * 1000 },
};

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || req.ip || 'unknown').toString().split(',')[0].trim();
}

function getRateLimitKey(namespace, identifier) {
  return `${namespace}:${identifier}`;
}

function getRateLimitEntry(key) {
  const entry = authRateBuckets.get(key);
  if (!entry) {
    return { count: 0, firstAttemptAt: 0, blockedUntil: 0 };
  }
  return entry;
}

function isRateLimited(key) {
  if (isAuthRateLimitDisabled()) return 0;

  const entry = getRateLimitEntry(key);
  const now = Date.now();
  if (entry.blockedUntil && entry.blockedUntil > now) {
    return Math.ceil((entry.blockedUntil - now) / 1000);
  }
  return 0;
}

function recordRateLimitFailure(key, config) {
  if (isAuthRateLimitDisabled()) return 0;

  const now = Date.now();
  const entry = getRateLimitEntry(key);

  if (entry.blockedUntil && entry.blockedUntil > now) {
    authRateBuckets.set(key, entry);
    return Math.ceil((entry.blockedUntil - now) / 1000);
  }

  if (!entry.firstAttemptAt || now > entry.firstAttemptAt + config.windowMs) {
    entry.count = 1;
    entry.firstAttemptAt = now;
    entry.blockedUntil = 0;
  } else {
    entry.count += 1;
  }

  if (entry.count > config.maxAttempts) {
    entry.blockedUntil = now + config.blockDurationMs;
    authRateBuckets.set(key, entry);
    return Math.ceil(config.blockDurationMs / 1000);
  }

  authRateBuckets.set(key, entry);
  return 0;
}

function recordRateLimitAttempt(key, config) {
  if (isAuthRateLimitDisabled()) return 0;

  const now = Date.now();
  const entry = getRateLimitEntry(key);

  if (entry.blockedUntil && entry.blockedUntil > now) {
    authRateBuckets.set(key, entry);
    return Math.ceil((entry.blockedUntil - now) / 1000);
  }

  if (!entry.firstAttemptAt || now > entry.firstAttemptAt + config.windowMs) {
    entry.count = 1;
    entry.firstAttemptAt = now;
    entry.blockedUntil = 0;
  } else {
    entry.count += 1;
  }

  if (entry.count > config.maxAttempts) {
    entry.blockedUntil = now + config.blockDurationMs;
    authRateBuckets.set(key, entry);
    return Math.ceil(config.blockDurationMs / 1000);
  }

  authRateBuckets.set(key, entry);
  return 0;
}

function resetRateLimit(key) {
  authRateBuckets.delete(key);
}

function isMarketingOnboardingOtp(req) {
  return String(req.body?.checkoutFlow || req.body?.flow || '').trim().toLowerCase() === 'marketing-onboarding';
}

function createTokens(userId, sessionId, options = {}) {
  const remember = options.remember === true;
  const accessToken = jwt.sign(
    { userId, sessionId },
    ACCESS_TOKEN_SECRET,
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    { userId, sessionId, remember },
    REFRESH_TOKEN_SECRET,
    { expiresIn: remember ? '30d' : '7d' }
  );

  return { accessToken, refreshToken };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function isSessionIdActive(user, sessionId) {
  return Boolean(sessionId) && String(user.activeSessionId || '') === String(sessionId);
}

function normalizePlatform(value) {
  const platform = String(value || '').trim().toLowerCase();
  return ['ios', 'android', 'web', 'windows', 'macos'].includes(platform) ? platform : 'web';
}

function compactSessionText(value, max = 300) {
  return String(value || '').trim().slice(0, max);
}

function requestPlatform(req) {
  return normalizePlatform(req.body.platform || req.headers['x-platform']);
}

async function persistSession({ userId, sessionId, refreshToken, req, deviceToken }) {
  const now = new Date();
  await Session.findOneAndUpdate(
    { sessionId },
    {
      $set: {
        user: userId,
        platform: requestPlatform(req),
        deviceName: compactSessionText(req.body.deviceName || req.headers['x-device-name'], 120),
        deviceToken: deviceToken || null,
        refreshTokenHash: hashToken(refreshToken),
        ipAddress: getClientIp(req),
        userAgent: compactSessionText(req.headers['user-agent'], 500),
        lastPingAt: now,
        loggedOutAt: null,
      },
      $setOnInsert: {
        loggedInAt: now,
      },
    },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

function createSignupToken(mobileNumber) {
  return jwt.sign(
    { mobileNumber },
    SIGNUP_TOKEN_SECRET,
    { expiresIn: '10m' }
  );
}

function toAuthUser(user) {
  return {
    _id: user._id,
    id: user._id,
    email: user.email,
    mobileNumber: user.mobileNumber,
    fullName: user.fullName,
    avatar: user.avatar,
    gender: user.gender,
    age: user.age,
    isOnTrial: user.isOnTrial,
    subscriptionStatus: user.subscriptionStatus,
  };
}

function sanitizeProfileAvatar(value) {
  const avatar = String(value || '').trim();
  if (!avatar) return null;
  const allowed = /^(?:assets\/(?:male[1-6]|female[1-6]|_stylized_3D_character_illustration,_semi-realistic_20260604\d{4}(?: \(\d\))?)\.jpeg|assets\/avatars\/(?:male[1-6]|female[1-6])-v1\.webp)$/;
  return allowed.test(avatar) ? avatar : undefined;
}

/**
 * GET /auth/me
 * Returns the currently authenticated user.
 */
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: toAuthUser(user) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /auth/me
 * Updates editable profile fields for the current user.
 */
router.patch('/me', protect, async (req, res) => {
  try {
    const updates = {};

    if (Object.prototype.hasOwnProperty.call(req.body, 'fullName')) {
      const fullName = String(req.body.fullName || '').trim();
      if (!fullName) return res.status(400).json({ error: 'Full name is required' });
      updates.fullName = fullName;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'email')) {
      const email = String(req.body.email || '').trim().toLowerCase();
      updates.email = email || null;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'avatar')) {
      const avatar = sanitizeProfileAvatar(req.body.avatar);
      if (avatar === undefined) {
        return res.status(400).json({ error: 'Please choose one of the Skillomate avatars' });
      }
      updates.avatar = avatar;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'gender')) {
      updates.gender = ['male', 'female', 'other'].includes(req.body.gender) ? req.body.gender : null;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'age')) {
      const age = Number(req.body.age);
      if (Number.isFinite(age) && age >= 13 && age <= 80) {
        updates.age = Math.round(age);
      } else if (req.body.age === null || req.body.age === '') {
        updates.age = null;
      } else {
        return res.status(400).json({ error: 'Age must be between 13 and 80' });
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: toAuthUser(user) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'That email is already registered' });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /auth/account
 * Permanently deletes the authenticated account after password re-verification.
 * Supports both bearer tokens and the app's existing userId/sessionId sessions.
 */
router.delete(
  '/account',
  requireCompatibleAuth(),
  sensitiveRateLimit({ namespace: 'account-delete', windowMs: 15 * 60 * 1000, max: 10 }),
  async (req, res) => {
  try {
    const confirmation = String(req.body.confirmation || '');
    const password = String(req.body.password || '');

    if (confirmation !== 'DELETE') {
      return res.status(400).json({
        error: 'Type DELETE exactly to confirm permanent account deletion.',
        code: 'INVALID_CONFIRMATION',
      });
    }
    if (!password) {
      return res.status(400).json({ error: 'Current password is required', code: 'PASSWORD_REQUIRED' });
    }

    const user = await User.findById(req.compatUser._id).select('_id passwordHash');
    if (!user) {
      return res.status(404).json({ error: 'Account not found', code: 'ACCOUNT_NOT_FOUND' });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash || '');
    if (!passwordMatches) {
      // The bearer session is still valid; this is a failed step-up check, not an
      // authentication-token failure. A 403 prevents mobile clients from rotating
      // or clearing a valid session in response to a mistyped password.
      return res.status(403).json({ error: 'Current password is incorrect', code: 'INVALID_PASSWORD' });
    }

    await deleteUserAccount(user._id);
    return res.status(200).json({ success: true, message: 'Your account has been permanently deleted.' });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'Account could not be deleted. Please try again.',
      code: error.code || 'ACCOUNT_DELETION_FAILED',
    });
  }
  }
);

/**
 * POST /auth/signup
 * Creates a new user and starts an authenticated session
 */
async function signup(req, res) {
  try {
    const { fullName, password, mobileNumber, signupToken } = req.body;
    const avatar = String(req.body.avatar || '').trim() || null;
    const gender = ['male', 'female', 'other'].includes(req.body.gender) ? req.body.gender : null;
    const age = Number.isInteger(Number(req.body.age)) ? Number(req.body.age) : null;

    if (!fullName || !password) {
      return res.status(400).json({ error: 'Full name and password are required' });
    }

    if (age === null || age < 13 || age > 80) {
      return res.status(400).json({ error: 'Age is required and must be between 13 and 80' });
    }

    if (!signupToken) {
      return res.status(400).json({ error: 'Please verify your mobile number first' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const normalizedMobile = normalizeMobileNumber(mobileNumber);
    let decodedSignup;

    try {
      decodedSignup = jwt.verify(signupToken, SIGNUP_TOKEN_SECRET);
    } catch (error) {
      return res.status(400).json({ error: 'Mobile verification expired. Please verify again' });
    }

    if (!normalizedMobile || decodedSignup.mobileNumber !== normalizedMobile) {
      return res.status(400).json({ error: 'Mobile verification does not match this signup' });
    }

    let onboarding = null;
    let onboardingSubscription = null;
    if (decodedSignup.purpose) {
      if (decodedSignup.purpose !== 'paid-onboarding') return res.status(401).json({ error: 'Invalid signup authorization' });
      const Onboarding = require('../models/OnboardingSession');
      onboarding = await Onboarding.findOne({ _id: decodedSignup.onboardingId, mobileNumber: normalizedMobile, completedAt: null });
      if (!onboarding) return res.status(401).json({ error: 'Signup session is no longer available' });
      const phonePeOrder = await require('../models/Order').exists({ user: onboarding._id, gateway: 'phonepe', orderType: 'one_time_access' });
      onboardingSubscription = phonePeOrder
        ? await require('../controllers/paymentController').reconcilePhonePeForUser(onboarding._id)
        : await require('../controllers/razorpayController').reconcileForUser(onboarding._id);
      if (!require('../services/subscriptionAccess').resolveSubscriptionAccess(onboardingSubscription, {}).active) {
        return res.status(409).json({ error: 'Payment has not been confirmed. Return to checkout to check its status.' });
      }
    }

    if (!onboarding) {
      // A normal OTP signup must claim the same reserved identity, not orphan an ad payment.
      onboarding = await require('../models/OnboardingSession').findOne({ mobileNumber: normalizedMobile, completedAt: null });
      if (onboarding) {
        const phonePeOrder = await require('../models/Order').exists({ user: onboarding._id, gateway: 'phonepe', orderType: 'one_time_access' });
        onboardingSubscription = phonePeOrder
          ? await require('../controllers/paymentController').reconcilePhonePeForUser(onboarding._id)
          : await require('../controllers/razorpayController').reconcileForUser(onboarding._id);
      }
    }
    const existingMobileUser = await User.findOne({ mobileNumber: normalizedMobile });
    if (existingMobileUser) {
      return res.status(409).json({ error: 'This mobile number is already registered', code: 'MOBILE_ALREADY_REGISTERED' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const sessionId = crypto.randomUUID();
    const user = await User.create({
      ...(onboarding ? { _id: onboarding._id } : {}),
      ...(onboardingSubscription ? {
        subscriptionId: onboardingSubscription._id,
        subscriptionStatus: onboardingSubscription.status === 'pending' ? 'none' : onboardingSubscription.status,
        subscriptionExpiry: onboardingSubscription.currentPeriodEnd || onboardingSubscription.trialExpiresAt || null,
        isOnTrial: onboardingSubscription.status === 'trial',
      } : {}),
      fullName: fullName.trim(),
      email: null,
      passwordHash,
      mobileNumber: normalizedMobile,
      avatar,
      gender,
      age,
      activeSessionId: sessionId,
      activeSessions: [sessionId],
      isMobileVerified: Boolean(normalizedMobile),
    });
    if (onboarding) {
      await require('../models/OnboardingSession').updateOne({ _id: onboarding._id }, {
        $set: { completedAt: new Date() }, $unset: { tokenHash: 1, handoffHash: 1 },
      });
    }
    const tokens = createTokens(user._id, sessionId);
    await persistSession({
      userId: user._id,
      sessionId,
      refreshToken: tokens.refreshToken,
      req,
      deviceToken: req.body.deviceToken,
    });

    res.status(201).json({
      ...tokens,
      _id: user._id,
      sessionId,
      user: toAuthUser(user),
      wishlist: [],
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'An account with these details already exists' });
    }

    res.status(500).json({ error: error.message });
  }
}

async function completePaidOnboarding(req, onboarding, onboardingSubscription) {
  const profile = onboarding?.pendingProfile;
  const mobileNumber = normalizeMobileNumber(onboarding?.mobileNumber);
  if (!profile?.fullName || !profile?.passwordHash || !mobileNumber) {
    const error = new Error('Your account details are incomplete. Please restart checkout.');
    error.status = 409;
    throw error;
  }
  if (!Number.isInteger(profile.age) || profile.age < 13 || profile.age > 80) {
    const error = new Error('Your saved age is invalid. Please restart checkout.');
    error.status = 409;
    throw error;
  }
  if (await User.exists({ mobileNumber })) {
    const error = new Error('This mobile number is already registered. Please sign in.');
    error.status = 409;
    throw error;
  }

  const sessionId = crypto.randomUUID();
  const user = await User.create({
    _id: onboarding._id,
    subscriptionId: onboardingSubscription._id,
    subscriptionStatus: onboardingSubscription.status === 'pending' ? 'none' : onboardingSubscription.status,
    subscriptionExpiry: onboardingSubscription.currentPeriodEnd || onboardingSubscription.trialExpiresAt || null,
    isOnTrial: onboardingSubscription.status === 'trial',
    fullName: profile.fullName.trim(),
    email: null,
    passwordHash: profile.passwordHash,
    mobileNumber,
    avatar: profile.avatar || 'assets/avatars/male1-v1.webp',
    gender: profile.gender || 'other',
    age: profile.age,
    activeSessionId: sessionId,
    activeSessions: [sessionId],
    isMobileVerified: true,
  });
  const tokens = createTokens(user._id, sessionId, { remember: true });
  await persistSession({
    userId: user._id,
    sessionId,
    refreshToken: tokens.refreshToken,
    req,
    deviceToken: req.body.deviceToken,
  });
  await require('../models/OnboardingSession').updateOne({ _id: onboarding._id, completedAt: null }, {
    $set: { completedAt: new Date() },
    $unset: { tokenHash: 1, handoffHash: 1, handoffExpiresAt: 1, pendingProfile: 1 },
  });
  return {
    ...tokens,
    _id: user._id,
    sessionId,
    user: toAuthUser(user),
    wishlist: [],
  };
}

router.post('/signup', signup);
router.post('/register', signup);

/**
 * POST /auth/verify-mobile-otp
 * Verifies a mobile OTP and returns a short-lived signup token.
 */
async function verifyMobileOtp(req, res) {
  try {
    const mobileNumber = req.body.mobileNumber || req.body.mobile || req.body.phone;
    const mobileOtp = req.body.mobileOtp || req.body.otp || req.body.code;
    const normalizedMobile = normalizeMobileNumber(mobileNumber);
    const clientIp = getClientIp(req);
    const phoneOtpKey = getRateLimitKey('otp:phone', normalizedMobile);
    const ipOtpKey = getRateLimitKey('otp:ip', clientIp);
    const skipOtpRateLimit = isMarketingOnboardingOtp(req);

    if (!normalizedMobile || (!mobileOtp && !AUTO_VERIFY_OTP)) {
      return res.status(400).json({ error: 'Mobile number and OTP are required' });
    }

    if (!skipOtpRateLimit) {
      const phoneBlockedSeconds = isRateLimited(phoneOtpKey);
      const ipBlockedSeconds = isRateLimited(ipOtpKey);
      if (phoneBlockedSeconds) {
        return res.status(429).json({ error: `Too many OTP verification attempts for this phone. Try again in ${phoneBlockedSeconds} seconds.` });
      }
      if (ipBlockedSeconds) {
        return res.status(429).json({ error: `Too many OTP verification attempts from this IP. Try again in ${ipBlockedSeconds} seconds.` });
      }
    }

    const existingUser = await User.findOne({ mobileNumber: normalizedMobile });
    if (existingUser) {
      return res.status(409).json({ error: 'This mobile number is already registered', code: 'MOBILE_ALREADY_REGISTERED' });
    }

    if (!AUTO_VERIFY_OTP) {
      const otpResult = await verifyMobileOtpCode(normalizedMobile, mobileOtp);
      if (!otpResult.ok) {
        if (!skipOtpRateLimit) {
          recordRateLimitFailure(phoneOtpKey, authRateConfig.otpByPhone);
          recordRateLimitFailure(ipOtpKey, authRateConfig.otpByIp);
        }
        return res.status(400).json({ error: otpResult.error });
      }
    }

    res.status(200).json({
      verified: true,
      message: 'Mobile number verified',
      signupToken: createSignupToken(normalizedMobile),
      mobileNumber: normalizedMobile,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

router.post('/verify-mobile-otp', verifyMobileOtp);
router.post('/verify-otp', verifyMobileOtp);
router.post('/verifyOtp', verifyMobileOtp);
router.post('/verify-mobile', verifyMobileOtp);
router.post('/verifyMobile', verifyMobileOtp);

/**
 * POST /auth/send-mobile-otp
 * Sends a one-time password to a mobile number.
 */
async function sendMobileOtpHandler(req, res) {
  try {
    const mobileNumber = req.body.mobileNumber || req.body.mobile || req.body.phone;
    const normalizedMobile = normalizeMobileNumber(mobileNumber);
    const clientIp = getClientIp(req);
    const phoneOtpKey = getRateLimitKey('otp:phone', normalizedMobile);
    const ipOtpKey = getRateLimitKey('otp:ip', clientIp);
    const skipOtpRateLimit = isMarketingOnboardingOtp(req);

    if (!normalizedMobile) {
      return res.status(400).json({ error: 'Mobile number is required' });
    }

    if (!skipOtpRateLimit) {
      const phoneBlockedSeconds = isRateLimited(phoneOtpKey);
      const ipBlockedSeconds = isRateLimited(ipOtpKey);
      if (phoneBlockedSeconds) {
        return res.status(429).json({ error: `Too many OTP requests for this phone. Try again in ${phoneBlockedSeconds} seconds.` });
      }
      if (ipBlockedSeconds) {
        return res.status(429).json({ error: `Too many OTP requests from this IP. Try again in ${ipBlockedSeconds} seconds.` });
      }
    }

    const existingUser = await User.findOne({ mobileNumber: normalizedMobile });
    if (existingUser) {
      return res.status(409).json({ error: 'This mobile number is already registered', code: 'MOBILE_ALREADY_REGISTERED' });
    }

    if (!skipOtpRateLimit) {
      const attemptBlocked = recordRateLimitAttempt(phoneOtpKey, authRateConfig.otpByPhone) || recordRateLimitAttempt(ipOtpKey, authRateConfig.otpByIp);
      if (attemptBlocked) {
        return res.status(429).json({ error: 'Too many OTP requests. Please wait a while and try again.' });
      }
    }

    const result = await (req.resendOtp ? resendMobileOtp : sendMobileOtp)(mobileNumber, { bypassCooldown: skipOtpRateLimit });
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
    const isDevelopmentProvider = ['development', 'demo'].includes(result.provider);
    const otpLabel = result.provider === 'demo' ? 'Demo' : 'Development';

    res.status(200).json({
      message: result.provider === 'msg91'
        ? 'OTP sent to your mobile number'
        : `${otpLabel} OTP: ${result.devOtp}`,
      provider: result.provider,
      otpLength: OTP_LENGTH,
      devOtp: isDevelopmentProvider ? result.devOtp : undefined,
      developmentAutofill: isDevelopmentProvider,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

router.post('/send-mobile-otp', sendMobileOtpHandler);
router.post('/send-otp', sendMobileOtpHandler);
router.post('/resend-mobile-otp', (req, res) => { req.resendOtp = true; return sendMobileOtpHandler(req, res); });
router.post('/sendOtp', sendMobileOtpHandler);
router.post('/request-otp', sendMobileOtpHandler);
router.post('/requestOtp', sendMobileOtpHandler);

/**
 * POST /auth/password-reset/request
 * Sends a password-reset OTP to an existing mobile account. The response is
 * intentionally generic so callers cannot use it to discover registered users.
 */
router.post('/password-reset/request', async (req, res) => {
  try {
    const normalizedMobile = normalizeMobileNumber(
      req.body.mobileNumber || req.body.mobile || req.body.phone
    );
    const clientIp = getClientIp(req);
    const phoneKey = getRateLimitKey('password-reset:phone', normalizedMobile);
    const ipKey = getRateLimitKey('password-reset:ip', clientIp);

    if (!/^\d{10,15}$/.test(normalizedMobile)) {
      return res.status(400).json({ error: 'Enter a valid registered mobile number' });
    }

    const phoneBlockedSeconds = isRateLimited(phoneKey);
    const ipBlockedSeconds = isRateLimited(ipKey);
    if (phoneBlockedSeconds || ipBlockedSeconds) {
      const retryAfter = Math.max(phoneBlockedSeconds, ipBlockedSeconds);
      return res.status(429).json({ error: `Too many reset requests. Try again in ${retryAfter} seconds.` });
    }

    const attemptBlocked = recordRateLimitAttempt(phoneKey, authRateConfig.otpByPhone)
      || recordRateLimitAttempt(ipKey, authRateConfig.otpByIp);
    if (attemptBlocked) {
      return res.status(429).json({ error: 'Too many reset requests. Please wait and try again.' });
    }

    const phoneCandidates = [...new Set([
      normalizedMobile,
      normalizedMobile.startsWith('91') && normalizedMobile.length === 12
        ? normalizedMobile.slice(2)
        : null,
      normalizedMobile.length === 10 ? `91${normalizedMobile}` : null,
    ].filter(Boolean))];
    const user = await User.findOne({ mobileNumber: { $in: phoneCandidates }, isActive: { $ne: false } });
    const genericMessage = 'If this mobile number is registered, a reset code has been sent.';

    if (!user) {
      return res.status(200).json({ message: genericMessage });
    }

    const result = await sendMobileOtp(user.mobileNumber || normalizedMobile);
    if (!result.ok) {
      return res.status(400).json({ error: result.error || 'Could not send reset code' });
    }

    const isDevelopmentProvider = ['development', 'demo'].includes(result.provider);
    return res.status(200).json({
      message: genericMessage,
      provider: result.provider,
      otpLength: OTP_LENGTH,
      devOtp: isDevelopmentProvider ? result.devOtp : undefined,
      developmentAutofill: isDevelopmentProvider,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /auth/password-reset/confirm
 * Verifies the reset OTP, changes the password, and revokes existing sessions.
 */
router.post('/password-reset/confirm', async (req, res) => {
  try {
    const normalizedMobile = normalizeMobileNumber(
      req.body.mobileNumber || req.body.mobile || req.body.phone
    );
    const otp = req.body.otp || req.body.code;
    const newPassword = String(req.body.newPassword || req.body.password || '');
    const clientIp = getClientIp(req);
    const phoneKey = getRateLimitKey('password-reset:verify:phone', normalizedMobile);
    const ipKey = getRateLimitKey('password-reset:verify:ip', clientIp);

    if (!/^\d{10,15}$/.test(normalizedMobile) || !otp) {
      return res.status(400).json({ error: 'Mobile number and reset code are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const phoneBlockedSeconds = isRateLimited(phoneKey);
    const ipBlockedSeconds = isRateLimited(ipKey);
    if (phoneBlockedSeconds || ipBlockedSeconds) {
      const retryAfter = Math.max(phoneBlockedSeconds, ipBlockedSeconds);
      return res.status(429).json({ error: `Too many reset attempts. Try again in ${retryAfter} seconds.` });
    }

    const phoneCandidates = [...new Set([
      normalizedMobile,
      normalizedMobile.startsWith('91') && normalizedMobile.length === 12
        ? normalizedMobile.slice(2)
        : null,
      normalizedMobile.length === 10 ? `91${normalizedMobile}` : null,
    ].filter(Boolean))];
    const user = await User.findOne({ mobileNumber: { $in: phoneCandidates }, isActive: { $ne: false } });
    if (!user) {
      recordRateLimitFailure(phoneKey, authRateConfig.otpByPhone);
      recordRateLimitFailure(ipKey, authRateConfig.otpByIp);
      return res.status(400).json({ error: 'Invalid or expired reset code' });
    }

    {
      // Recovery must prove phone ownership even when signup auto-verification is enabled.
      const otpResult = await verifyMobileOtpCode(user.mobileNumber || normalizedMobile, otp);
      if (!otpResult.ok) {
        recordRateLimitFailure(phoneKey, authRateConfig.otpByPhone);
        recordRateLimitFailure(ipKey, authRateConfig.otpByIp);
        return res.status(400).json({ error: otpResult.error || 'Invalid or expired reset code' });
      }
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const now = new Date();
    await Promise.all([
      User.findByIdAndUpdate(user._id, {
        $set: {
          passwordHash,
          activeSessionId: null,
          activeSessions: [],
          deviceToken: null,
        },
      }),
      Session.updateMany(
        { user: user._id, loggedOutAt: null },
        { $set: { loggedOutAt: now, lastPingAt: now } }
      ),
    ]);

    resetRateLimit(phoneKey);
    resetRateLimit(ipKey);
    return res.status(200).json({ message: 'Password updated. Sign in with your new password.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /auth/login
 * Authenticates user and creates a new session
 * @param {string} mobileNumber - User mobile number
 * @param {string} password - User password
 * @param {string} [deviceToken] - Optional FCM device token
 * @returns {Object} accessToken, refreshToken
 */
router.post('/login', async (req, res) => {
  try {
    const { mobileNumber, loginId, password, deviceToken } = req.body;
    const remember = req.body.remember === true;
    const clientIp = getClientIp(req);
    const identifier = String(
      loginId ||
      mobileNumber ||
      req.body.identifier ||
      req.body.mobile ||
      req.body.phone ||
      ''
    ).trim();

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Mobile number and password required' });
    }

    const normalizedPhone = normalizeMobileNumber(identifier);
    const phoneCandidates = normalizedPhone
      ? [...new Set([
          normalizedPhone,
          normalizedPhone.startsWith('91') && normalizedPhone.length === 12
            ? normalizedPhone.slice(2)
            : null,
          normalizedPhone.length === 10 ? `91${normalizedPhone}` : null,
        ].filter(Boolean))]
      : [];
    const loginQuery = { mobileNumber: { $in: phoneCandidates } };

    if (!/^\d{10,15}$/.test(normalizedPhone)) {
      return res.status(400).json({ error: 'Valid mobile number is required' });
    }

    const loginLimitKey = getRateLimitKey('login:user', normalizedPhone);
    const ipLimitKey = getRateLimitKey('login:ip', clientIp);
    const loginBlockedSeconds = isRateLimited(loginLimitKey);
    const ipBlockedSeconds = isRateLimited(ipLimitKey);

    if (loginBlockedSeconds) {
      return res.status(429).json({ error: `Too many login attempts. Try again in ${loginBlockedSeconds} seconds.` });
    }
    if (ipBlockedSeconds) {
      return res.status(429).json({ error: `Too many login attempts from this IP. Try again in ${ipBlockedSeconds} seconds.` });
    }

    // Find user with password field
    const user = await User.findOne(loginQuery).select('+passwordHash +deviceToken +activeSessionId +activeSessions');

    if (!user) {
      recordRateLimitFailure(loginLimitKey, authRateConfig.loginByPhone);
      recordRateLimitFailure(ipLimitKey, authRateConfig.loginByIp);
      return res.status(404).json({ error: 'Account does not exist.', code: 'MOBILE_NOT_REGISTERED' });
    }

    if (user.isActive === false) {
      recordRateLimitFailure(loginLimitKey, authRateConfig.loginByPhone);
      recordRateLimitFailure(ipLimitKey, authRateConfig.loginByIp);
      return res.status(404).json({ error: 'Account does not exist.', code: 'ACCOUNT_NOT_FOUND' });
    }

    // Verify password (assuming bcrypt is used)
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      recordRateLimitFailure(loginLimitKey, authRateConfig.loginByPhone);
      recordRateLimitFailure(ipLimitKey, authRateConfig.loginByIp);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Success: clear rate limit counters after a valid login
    resetRateLimit(loginLimitKey);
    resetRateLimit(ipLimitKey);

    // Generate new session ID
    const sessionId = crypto.randomUUID();

    // Update user with new session and device token
    await User.findByIdAndUpdate(user._id, {
      $set: {
        activeSessionId: sessionId,
        activeSessions: [sessionId],
        deviceToken: deviceToken || user.deviceToken,
        lastLoginAt: new Date(),
      },
      $inc: { loginCount: 1 },
    });

    // Revoke historical session records; the atomic user update above is authoritative.
    await Session.updateMany(
      { user: user._id, sessionId: { $ne: sessionId }, loggedOutAt: null },
      { $set: { loggedOutAt: new Date() } }
    );

    // Sign JWT with sessionId
    const tokens = createTokens(user._id, sessionId, { remember });
    await persistSession({
      userId: user._id,
      sessionId,
      refreshToken: tokens.refreshToken,
      req,
      deviceToken,
    });

    res.status(200).json({
      ...tokens,
      _id: user._id,
      sessionId,
      user: toAuthUser(user),
      wishlist: user.wishlist || [],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /auth/refresh
 * Issues a new access token from a valid refresh token.
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
    const user = await User.findById(decoded.userId).select('+activeSessionId +activeSessions');
    const sessionId = decoded.sessionId;

    if (!user || user.isActive === false || !isSessionIdActive(user, sessionId)) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    const session = await Session.findOne({
      user: user._id,
      sessionId,
      loggedOutAt: null,
    }).select('+refreshTokenHash');

    if (!session && !isSessionIdActive(user, sessionId)) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    if (session?.refreshTokenHash && session.refreshTokenHash !== hashToken(refreshToken)) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    const tokens = createTokens(user._id, sessionId, { remember: decoded.remember === true });
    await Session.updateOne(
      { user: user._id, sessionId },
      {
        $set: {
          refreshTokenHash: hashToken(tokens.refreshToken),
          lastPingAt: new Date(),
        },
      }
    );

    res.status(200).json({
      ...tokens,
      _id: user._id,
      sessionId,
      user: toAuthUser(user),
    });
  } catch (error) {
    if (['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name)) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
    res.status(503).json({ error: 'Session refresh temporarily unavailable. Please retry.' });
  }
});

/**
 * GET /auth/sessions
 * Lists active sessions for the current user.
 */
router.get('/sessions', protect, async (req, res) => {
  try {
    const sessions = await Session.find({
      user: req.user._id,
      loggedOutAt: null,
    })
      .select('+sessionId platform deviceName ipAddress userAgent loggedInAt lastPingAt')
      .sort({ lastPingAt: -1 })
      .lean();

    res.json({
      sessions: sessions.map((session) => {
        const { sessionId, ...publicSession } = session;
        return {
          ...publicSession,
          isCurrent: String(sessionId || '') === String(req.authSessionId || ''),
        };
      }),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /auth/logout
 * Invalidates current session and clears device token
 * @requires Authentication
 * @returns {Object} success message
 */
router.post('/logout', protect, async (req, res) => {
  try {
    const sessionId = req.authSessionId;
    const update = {
      $pull: { activeSessions: sessionId },
    };

    if (String(req.user.activeSessionId || '') === String(sessionId)) {
      update.$set = {
        activeSessionId: null,
        deviceToken: null,
      };
    }

    await Promise.all([
      User.updateOne({ _id: req.user._id, activeSessionId: sessionId }, update),
      Session.updateOne(
        { user: req.user._id, sessionId },
        { $set: { loggedOutAt: new Date(), lastPingAt: new Date() } }
      ),
    ]);

    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /auth/logout-all
 * Revokes all sessions for the current user.
 */
router.post('/logout-all', protect, async (req, res) => {
  try {
    const now = new Date();
    await Promise.all([
      User.findByIdAndUpdate(req.user._id, {
        $set: {
          activeSessionId: null,
          activeSessions: [],
          deviceToken: null,
        },
      }),
      Session.updateMany(
        { user: req.user._id, loggedOutAt: null },
        { $set: { loggedOutAt: now, lastPingAt: now } }
      ),
    ]);

    res.status(200).json({ message: 'Logged out from all devices' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.completePaidOnboarding = completePaidOnboarding;
module.exports = router;
