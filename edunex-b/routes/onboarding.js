const express = require('express');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const Onboarding = require('../models/OnboardingSession');
const User = require('../models/User');
const billing = require('../controllers/razorpayController');
const phonePeBilling = require('../controllers/paymentController');
const phonePeService = require('../services/phonePeService');
const { isPhonePeNewPaymentsEnabled } = require('../services/phonePePolicy');
const rzp = require('../services/razorpayService');
const paymentModes = require('../services/paymentMode');
const marketing = require('../services/marketingSettings');
function adMode() {
  const mode = process.env.AD_PAYMENT_MODE || (process.env.NODE_ENV !== 'production' ? 'test' : '');
  if (!['test', 'live'].includes(mode)) throw fail('Configure AD_PAYMENT_MODE before opening checkout.', 503);
  return mode;
}
const { resolveSubscriptionAccess } = require('../services/subscriptionAccess');
const router = express.Router();
const secret = process.env.JWT_SIGNUP_SECRET || (process.env.NODE_ENV !== 'production' ? 'edunex-development-signup-secret' : null);
if (!secret) throw new Error('JWT_SIGNUP_SECRET is required');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const token = () => crypto.randomBytes(32).toString('hex');
const wrap = fn => async (req, res) => { try { await fn(req, res); } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Onboarding is temporarily unavailable. Please retry.' }); } };
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.get('/config', wrap(async (_req, res) => {
  const provider = await paymentModes.activeProvider();
  const publicMarketing = await marketing.publicConfig();
  if (provider === 'phonepe') {
    if (!isPhonePeNewPaymentsEnabled(process.env)) throw fail('PhonePe checkout is unavailable.', 503);
    return res.json({ gateway: 'phonepe', oneTimeAmountPaise: phonePeService.oneTimeAmountPaise, accessDays: phonePeService.oneTimeAccessDays, ...publicMarketing });
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
async function requireSession(req, res, next) {
  try {
    const bearer = String(req.headers.authorization || '').replace(/^Bearer /, '');
    if (!/^[a-f0-9]{64}$/.test(bearer)) throw fail('Phone verification session expired.', 401);
    const session = await Onboarding.findOne({ tokenHash: hash(bearer), expiresAt: { $gt: new Date() }, completedAt: null });
    if (!session || await User.exists({ mobileNumber: session.mobileNumber })) throw fail('Please verify your phone or sign in again.', 401);
    req.onboarding = session;
    req.onboardingMode = await paymentModes.activeProvider() === 'phonepe' ? null : adMode();
    req.user = { _id: session._id, mobileNumber: session.mobileNumber, isMobileVerified: true };
    next();
  } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Unable to resume onboarding.' }); }
}
router.post('/checkout', requireSession, async (req, res, next) => {
  const provider = await paymentModes.activeProvider();
  if (provider === 'phonepe' && req.body.paymentType !== 'one_time') return res.status(400).json({ error: 'Choose the one-time PhonePe payment.' });
  if (provider !== 'phonepe' && !['trial', 'monthly'].includes(req.body.paymentType)) return res.status(400).json({ error: 'Choose a supported plan.' });
  if (provider === 'phonepe') return phonePeBilling.initiateTrial(req, res, next);
  return billing.initiate(req, res, next);
});
router.post('/verify', requireSession, async (req, res, next) => {
  const provider = await paymentModes.activeProvider();
  if (provider === 'phonepe') return phonePeBilling.verifyAppAccess(req, res, next);
  return billing.verify(req, res, next);
});
router.get('/status', requireSession, async (req, res, next) => {
  const provider = await paymentModes.activeProvider();
  if (provider === 'phonepe') return phonePeBilling.subscriptionStatus(req, res, next);
  return billing.status(req, res, next);
});
router.post('/cancel', requireSession, async (req, res, next) => {
  const provider = await paymentModes.activeProvider();
  if (provider === 'phonepe') return phonePeBilling.cancelSubscription(req, res, next);
  return billing.cancel(req, res, next);
});
router.post('/handoff', requireSession, wrap(async (req, res) => {
  const phonePeOrder = await require('../models/Order').exists({ user: req.onboarding._id, gateway: 'phonepe', orderType: 'one_time_access' });
  const subscription = phonePeOrder
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
  res.json({ mobileNumber: session.mobileNumber, signupToken: jwt.sign({ mobileNumber: session.mobileNumber, purpose: 'paid-onboarding', onboardingId: String(session._id) }, secret, { expiresIn: '30m' }) });
}));
module.exports = router;
