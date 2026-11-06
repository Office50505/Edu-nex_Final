const express = require('express');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Onboarding = require('../models/OnboardingSession');
const User = require('../models/User');
const billing = require('../controllers/razorpayController');
const phonePeBilling = require('../controllers/paymentController');
const standardPhonePeBilling = require('../controllers/phonePeStandardAutoPayController');
const standardPhonePeService = require('../services/phonePeStandardAutoPayService');
const PhonePeAutoPayBilling = require('../models/PhonePeAutoPayBilling');
const { isPhonePeNewPaymentsSwitchEnabled } = require('../services/phonePePolicy');
const rzp = require('../services/razorpayService');
const paymentModes = require('../services/paymentMode');
const marketing = require('../services/marketingSettings');
function standardPhonePeEnabled() {
  const readiness = standardPhonePeService.readiness();
  return readiness.configured
    && readiness.schedulerEnabled
    && (readiness.mode !== 'live' || readiness.liveRecurringEnabled);
}
function standardPhonePeRecordsEnabled() {
  try { return standardPhonePeService.config().enabled; }
  catch { return false; }
}
function adMode() {
  const mode = process.env.AD_PAYMENT_MODE || (process.env.NODE_ENV !== 'production' ? 'test' : '');
  if (!['test', 'live'].includes(mode)) throw fail('Configure AD_PAYMENT_MODE before opening checkout.', 503);
  return mode;
}
async function marketingCheckoutProvider() {
  const configured = String(process.env.MARKETING_PAYMENT_GATEWAY || process.env.ONBOARDING_PAYMENT_GATEWAY || '').trim().toLowerCase();
  if (['phonepe', 'razorpay'].includes(configured)) return configured;
  if (isPhonePeNewPaymentsSwitchEnabled(process.env)) return 'phonepe';
  return paymentModes.activeProvider();
}
const { resolveSubscriptionAccess } = require('../services/subscriptionAccess');
const router = express.Router();
const secret = process.env.JWT_SIGNUP_SECRET || (process.env.NODE_ENV !== 'production' ? 'edunex-development-signup-secret' : null);
if (!secret) throw new Error('JWT_SIGNUP_SECRET is required');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const token = () => crypto.randomBytes(32).toString('hex');
const pendingMobile = () => `pending:${crypto.randomUUID()}`;
const isPendingMobile = value => String(value || '').startsWith('pending:');
const wrap = fn => async (req, res) => { try { await fn(req, res); } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Onboarding is temporarily unavailable. Please retry.' }); } };
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.get('/config', wrap(async (_req, res) => {
  const provider = await marketingCheckoutProvider();
  const publicMarketing = await marketing.publicConfig();
  if (provider === 'phonepe') {
    if (standardPhonePeEnabled()) {
      return res.json({
        gateway: 'phonepe',
        checkoutEnabled: true,
        trialAmountPaise: standardPhonePeService.SETUP_AMOUNT_PAISE,
        subscriptionAmountPaise: standardPhonePeService.MONTHLY_AMOUNT_PAISE,
        trialHours: standardPhonePeService.TRIAL_HOURS,
        autoRenewEnabled: true,
        ...publicMarketing,
      });
    }
    throw fail('PhonePe Standard AutoPay checkout is temporarily unavailable.', 503);
  }
  const c = rzp.requireConfig(adMode());
  res.json({ mode: c.mode, gateway: provider, trialAmountPaise: c.trialAmount, subscriptionAmountPaise: c.monthlyAmount, trialHours: c.trialHours, ...publicMarketing });
}));
router.post('/session', wrap(async (req, res) => {
  let proof;
  try { proof = jwt.verify(req.body.signupToken, secret); } catch (_) { throw fail('Please verify your phone number again.', 401); }
  if (proof.purpose || !proof.mobileNumber) throw fail('Invalid phone verification.', 401);
  if (await User.exists({ mobileNumber: proof.mobileNumber })) throw fail('This phone already has an account. Please sign in.', 409);
  // Older account deletions left completed onboarding records behind. Fresh OTP
  // proof and no registered user allow a new identity, never the old entitlement.
  await Onboarding.deleteMany({ mobileNumber: proof.mobileNumber, completedAt: { $type: 'date' } });
  const bearer = token();
  const session = await Onboarding.findOneAndUpdate({ mobileNumber: proof.mobileNumber }, {
    $set: { tokenHash: hash(bearer), expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  }, { upsert: true, new: true, setDefaultsOnInsert: true });
  if (session.completedAt) throw fail('Please sign in to your existing account.', 409);
  res.json({ token: bearer });
}));
router.post('/guest-session', wrap(async (_req, res) => {
  const bearer = token();
  const session = await Onboarding.create({
    mobileNumber: pendingMobile(),
    tokenHash: hash(bearer),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  res.status(201).json({ token: bearer, sessionId: String(session._id) });
}));
async function requireSession(req, res, next) {
  try {
    const bearer = String(req.headers.authorization || '').replace(/^Bearer /, '');
    if (!/^[a-f0-9]{64}$/.test(bearer)) throw fail('Phone verification session expired.', 401);
    const session = await Onboarding.findOne({ tokenHash: hash(bearer), expiresAt: { $gt: new Date() }, completedAt: null });
    if (!session || (!isPendingMobile(session.mobileNumber) && await User.exists({ mobileNumber: session.mobileNumber }))) throw fail('Please verify your phone or sign in again.', 401);
    const provider = await marketingCheckoutProvider();
    req.onboarding = session;
    req.onboardingProvider = provider;
    req.onboardingMode = provider === 'phonepe' ? null : adMode();
    req.user = { _id: session._id, mobileNumber: isPendingMobile(session.mobileNumber) ? null : session.mobileNumber, isMobileVerified: !isPendingMobile(session.mobileNumber) };
    next();
  } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Unable to resume onboarding.' }); }
}
async function useStandardPhonePeForSession(req) {
  if (!standardPhonePeRecordsEnabled()) return false;
  if (standardPhonePeEnabled()) return true;
  return Boolean(await PhonePeAutoPayBilling.exists({ _id: req.onboarding._id }));
}
router.post('/checkout', requireSession, async (req, res, next) => {
  const provider = req.onboardingProvider || await marketingCheckoutProvider();
  if (provider === 'phonepe' && !standardPhonePeEnabled()) {
    return res.status(503).json({ error: 'PhonePe Standard AutoPay checkout is temporarily unavailable.' });
  }
  if (provider === 'phonepe' && standardPhonePeEnabled() && !['trial', 'monthly'].includes(req.body.paymentType)) return res.status(400).json({ error: 'Choose the ₹1 trial or ₹499 monthly plan.' });
  if (provider !== 'phonepe' && !['trial', 'monthly'].includes(req.body.paymentType)) return res.status(400).json({ error: 'Choose a supported plan.' });
  if (provider === 'phonepe') return standardPhonePeBilling.initiate(req, res, next);
  return billing.initiate(req, res, next);
});
router.post('/profile', requireSession, wrap(async (req, res) => {
  const fullName = String(req.body.fullName || '').trim();
  const password = String(req.body.password || '');
  const gender = ['male', 'female', 'other'].includes(req.body.gender) ? req.body.gender : 'other';
  const age = Number(req.body.age);
  if (fullName.length < 2 || fullName.length > 80) throw fail('Enter your full name.', 400);
  if (password.length < 8 || password.length > 128) throw fail('Password must be between 8 and 128 characters.', 400);
  if (!Number.isInteger(age) || age < 13 || age > 80) throw fail('Age must be between 13 and 80.', 400);
  const passwordHash = await bcrypt.hash(password, 12);
  await Onboarding.updateOne({ _id: req.onboarding._id, completedAt: null }, {
    $set: {
      pendingProfile: {
        fullName,
        passwordHash,
        gender,
        age,
        avatar: gender === 'female' ? 'assets/avatars/female1-v1.webp' : 'assets/avatars/male1-v1.webp',
      },
    },
  });
  res.json({ saved: true });
}));
router.post('/complete', requireSession, wrap(async (req, res) => {
  const provider = req.onboardingProvider || await marketingCheckoutProvider();
  const standardBilling = provider === 'phonepe' && standardPhonePeRecordsEnabled()
    ? await PhonePeAutoPayBilling.exists({ _id: req.onboarding._id })
    : null;
  const phonePeOrder = provider === 'phonepe'
    ? await require('../models/Order').exists({ user: req.onboarding._id, gateway: 'phonepe', orderType: 'one_time_access' })
    : false;
  const subscription = standardBilling
    ? await standardPhonePeBilling.reconcileForUser(req.onboarding._id)
    : phonePeOrder
    ? await phonePeBilling.reconcilePhonePeForUser(req.onboarding._id)
    : await billing.reconcileForUser(req.onboarding._id);
  if (!resolveSubscriptionAccess(subscription, {}).active) throw fail('Payment is still awaiting confirmation.', 409);
  const auth = require('./auth');
  const result = await auth.completePaidOnboarding(req, req.onboarding, subscription);
  res.status(201).json(result);
}));
router.post('/verify', requireSession, async (req, res, next) => {
  const provider = req.onboardingProvider || await marketingCheckoutProvider();
  if (provider === 'phonepe') return await useStandardPhonePeForSession(req)
    ? standardPhonePeBilling.verifyAccess(req, res, next)
    : phonePeBilling.verifyAppAccess(req, res, next);
  return billing.verify(req, res, next);
});
router.get('/status', requireSession, async (req, res, next) => {
  const provider = req.onboardingProvider || await marketingCheckoutProvider();
  if (provider === 'phonepe') return await useStandardPhonePeForSession(req)
    ? standardPhonePeBilling.status(req, res, next)
    : phonePeBilling.subscriptionStatus(req, res, next);
  return billing.status(req, res, next);
});
router.post('/cancel', requireSession, async (req, res, next) => {
  const provider = req.onboardingProvider || await marketingCheckoutProvider();
  if (provider === 'phonepe') return await useStandardPhonePeForSession(req)
    ? standardPhonePeBilling.cancel(req, res, next)
    : phonePeBilling.cancelSubscription(req, res, next);
  return billing.cancel(req, res, next);
});
router.post('/handoff', requireSession, wrap(async (req, res) => {
  const standardBilling = standardPhonePeRecordsEnabled()
    ? await PhonePeAutoPayBilling.exists({ _id: req.onboarding._id })
    : null;
  const phonePeOrder = await require('../models/Order').exists({ user: req.onboarding._id, gateway: 'phonepe', orderType: 'one_time_access' });
  const subscription = standardBilling
    ? await standardPhonePeBilling.reconcileForUser(req.onboarding._id)
    : phonePeOrder
    ? await phonePeBilling.reconcilePhonePeForUser(req.onboarding._id)
    : await billing.reconcileForUser(req.onboarding._id);
  if (!resolveSubscriptionAccess(subscription, {}).active) throw fail('Payment is still awaiting confirmation.', 409);
  const code = token();
  await Onboarding.updateOne({ _id: req.onboarding._id, completedAt: null }, { $set: { handoffHash: hash(code), handoffExpiresAt: new Date(Date.now() + 5 * 60 * 1000) } });
  res.json({ code });
}));
router.post('/resume', wrap(async (req, res) => {
  if (!/^[a-f0-9]{64}$/.test(req.body.code || '')) throw fail('Invalid signup return link.', 401);
  const session = await Onboarding.findOneAndUpdate({ handoffHash: hash(req.body.code), handoffExpiresAt: { $gt: new Date() }, completedAt: null },
    { $unset: { handoffHash: 1, handoffExpiresAt: 1 } }, { new: true });
  if (!session) throw fail('Return link expired or already used. Return to the ad page and check payment status.', 401);
  if (isPendingMobile(session.mobileNumber)) {
    const bearer = token();
    await Onboarding.updateOne({ _id: session._id, completedAt: null }, {
      $set: { tokenHash: hash(bearer), expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
    });
    return res.json({ requiresMobileVerification: true, onboardingToken: bearer });
  }
  res.json({ mobileNumber: session.mobileNumber, signupToken: jwt.sign({ mobileNumber: session.mobileNumber, purpose: 'paid-onboarding', onboardingId: String(session._id) }, secret, { expiresIn: '30m' }) });
}));
router.post('/attach-phone', requireSession, wrap(async (req, res) => {
  let proof;
  try { proof = jwt.verify(req.body.signupToken, secret); } catch (_) { throw fail('Please verify your phone number again.', 401); }
  if (proof.purpose || !proof.mobileNumber) throw fail('Invalid phone verification.', 401);
  if (await User.exists({ mobileNumber: proof.mobileNumber })) throw fail('This phone already has an account. Please sign in.', 409);
  const conflict = await Onboarding.findOne({
    _id: { $ne: req.onboarding._id },
    mobileNumber: proof.mobileNumber,
    completedAt: null,
  });
  if (conflict) {
    await Onboarding.deleteOne({ _id: conflict._id, tokenHash: { $exists: false } });
    if (await Onboarding.exists({ _id: conflict._id })) throw fail('This phone already has a pending checkout. Please resume that checkout or contact support.', 409);
  }
  await Onboarding.updateOne({ _id: req.onboarding._id, completedAt: null }, { $set: { mobileNumber: proof.mobileNumber } });
  res.json({ mobileNumber: proof.mobileNumber, signupToken: jwt.sign({ mobileNumber: proof.mobileNumber, purpose: 'paid-onboarding', onboardingId: String(req.onboarding._id) }, secret, { expiresIn: '30m' }) });
}));
module.exports = router;
