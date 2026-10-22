const Subscription = require('../models/Subscription');
const AppleSubscription = require('../models/AppleSubscription');
const GooglePlaySubscription = require('../models/GooglePlaySubscription');
const Course = require('../models/Course');
const { resolveAllSubscriptionAccess } = require('../services/subscriptionAccess');
const { activeCourseEntitlement } = require('../services/courseAccess');

function primaryTrialCourseFilter() {
  return {
    status: 'published',
    $or: [
      { title: /\bai\s+influenc(?:er|e)\b/i },
      { slug: /\bai[-\s]+influenc(?:er|e)\b/i },
    ],
  };
}

async function trialUnlockedCourseId() {
  const primaryCourse = await Course.findOne(primaryTrialCourseFilter())
    .sort({ publishedAt: 1, createdAt: 1, _id: 1 })
    .select('_id')
    .lean();
  if (primaryCourse) return String(primaryCourse._id);

  const firstCourse = await Course.findOne({ status: 'published' })
    .sort({ publishedAt: -1, createdAt: -1, _id: -1 })
    .select('_id')
    .lean();
  return firstCourse ? String(firstCourse._id) : '';
}

async function isTrialUnlockedCourse(courseId) {
  if (!courseId) return true;
  const unlockedCourseId = await trialUnlockedCourseId();
  return !unlockedCourseId || unlockedCourseId === String(courseId);
}

async function checkSubscription(req, res, next) {
  try {
    const courseId = String(req.params?.id || req.params?.courseId || req.body?.course || req.body?.courseId || req.query?.courseId || '');
    const entitlement = activeCourseEntitlement(req.user, courseId);
    if (entitlement) {
      req.courseAccess = { type: 'purchase', courseId, accessType: entitlement.accessType, expiresAt: entitlement.expiresAt || null };
      return next();
    }
    const [subscription, appleSubscription, googlePlaySubscription] = await Promise.all([
      Subscription.findOne({ user: req.user._id }),
      AppleSubscription.findOne({ user: req.user._id }),
      GooglePlaySubscription.findOne({ user: req.user._id }),
    ]);
    const access = resolveAllSubscriptionAccess(subscription, appleSubscription, googlePlaySubscription, req.user);
    if (!access.active) {
      return res.status(403).json({ error: subscription || appleSubscription || googlePlaySubscription ? 'subscription_expired' : 'no_subscription' });
    }
    const limitedTrial = access.status === 'trial' && !access.grace;
    if (limitedTrial && !(await isTrialUnlockedCourse(courseId))) {
      return res.status(403).json({ error: 'trial_course_locked', message: 'This course unlocks after AutoPay starts or after an upfront purchase.' });
    }
    req.subscription = subscription || null;
    req.subscriptionAccess = access;
    return next();
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = { checkSubscription, isTrialUnlockedCourse, trialUnlockedCourseId };
