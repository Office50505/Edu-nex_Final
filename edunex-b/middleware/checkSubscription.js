const Subscription = require('../models/Subscription');
const Course = require('../models/Course');
const { resolveSubscriptionAccess } = require('../services/subscriptionAccess');
const { activeCourseEntitlement } = require('../services/courseAccess');

async function isFirstPublishedCourse(courseId) {
  if (!courseId) return true;
  const firstCourse = await Course.findOne({ status: 'published' })
    .sort({ publishedAt: -1, createdAt: -1, _id: -1 })
    .select('_id')
    .lean();
  return !firstCourse || String(firstCourse._id) === String(courseId);
}

async function checkSubscription(req, res, next) {
  try {
    const courseId = String(req.params?.id || req.params?.courseId || req.body?.course || req.body?.courseId || req.query?.courseId || '');
    const entitlement = activeCourseEntitlement(req.user, courseId);
    if (entitlement) {
      req.courseAccess = { type: 'purchase', courseId, accessType: entitlement.accessType, expiresAt: entitlement.expiresAt || null };
      return next();
    }
    const subscription = await Subscription.findOne({ user: req.user._id });
    const access = resolveSubscriptionAccess(subscription, req.user);
    if (!access.active) {
      return res.status(403).json({ error: subscription ? 'subscription_expired' : 'no_subscription' });
    }
    const limitedTrial = access.status === 'trial' && !access.grace;
    if (limitedTrial && !(await isFirstPublishedCourse(courseId))) {
      return res.status(403).json({ error: 'trial_course_locked', message: 'This course unlocks after AutoPay starts or after an upfront purchase.' });
    }
    req.subscription = subscription || null;
    req.subscriptionAccess = access;
    return next();
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = { checkSubscription };
