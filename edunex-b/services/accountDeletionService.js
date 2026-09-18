const User = require('../models/User');
const Session = require('../models/Session');
const Progress = require('../models/Progress');
const CourseProgress = require('../models/CourseProgress');
const LessonNote = require('../models/LessonNote');
const Notification = require('../models/Notification');
const Wishlist = require('../models/Wishlist');
const Review = require('../models/Review');
const Certificate = require('../models/Certificate');
const Subscription = require('../models/Subscription');
const SubscriptionEvent = require('../models/SubscriptionEvent');
const Order = require('../models/Order');
const RazorpayBilling = require('../models/RazorpayBilling');
const AiTutorSession = require('../models/AiTutorSession');
const ContactEnquiry = require('../models/ContactEnquiry');
const AnalyticsEvent = require('../models/AnalyticsEvent');

class AccountDeletionError extends Error {
  constructor(message, statusCode = 500, code = 'ACCOUNT_DELETION_FAILED') {
    super(message);
    this.name = 'AccountDeletionError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Permanently removes a user and all data owned by that user.
 *
 * The user record is intentionally deleted last. If any dependent cleanup fails,
 * the account remains available so the operation can safely be retried.
 */
async function deleteUserAccount(userId, options = {}) {
  const user = await User.findById(userId).select('_id');
  if (!user) {
    throw new AccountDeletionError('Account not found', 404, 'ACCOUNT_NOT_FOUND');
  }

  const billing = await RazorpayBilling.findById(userId);
  const userIdString = String(user._id);
  const subscriptions = await Subscription.find({ user: user._id })
    .select('_id phonePeMandateId status gateway razorpaySubscriptionId razorpayMode')
    .lean();
  const subscriptionIds = subscriptions.map((subscription) => subscription._id);
  if (!options.skipBillingCancellation) {
    try {
      await require('./cancelAccountBilling').cancelAccountBilling(billing, subscriptions);
    } catch (error) {
      throw new AccountDeletionError(
        error.message?.startsWith('Payment setup') || error.message?.startsWith('Subscription cancellation') || error.message?.startsWith('We could not')
          ? error.message : 'Automatic subscription cancellation is unavailable. Your account has not been deleted. Please retry.',
        503, 'BILLING_CANCELLATION_FAILED'
      );
    }
  }

  const results = await Promise.all([
    RazorpayBilling.deleteMany({ _id: user._id }),
    Progress.deleteMany({ user: user._id }),
    CourseProgress.deleteMany({ userId: userIdString }),
    LessonNote.deleteMany({ user: user._id }),
    Notification.deleteMany({ recipient: user._id }),
    Wishlist.deleteMany({ user: user._id }),
    Review.deleteMany({ user: user._id }),
    Certificate.deleteMany({ userId: userIdString }),
    AiTutorSession.deleteMany({ user: user._id }),
    ContactEnquiry.deleteMany({ userId: user._id }),
    AnalyticsEvent.deleteMany({
      $or: [
        { user: user._id },
        { userId: user._id },
        { userId: userIdString },
      ],
    }),
    Order.deleteMany({ user: user._id }),
    SubscriptionEvent.deleteMany({
      $or: [
        { user: user._id },
        { subscription: { $in: subscriptionIds } },
      ],
    }),
    Subscription.deleteMany({ user: user._id }),
    Session.deleteMany({ user: user._id }),
    require('../models/LearningProgress').deleteMany({ userId: userIdString }),
    require('../models/AssessmentResult').deleteMany({ userId: userIdString }),
  ]);

  const deletedUser = await User.deleteOne({ _id: user._id });
  if (deletedUser.deletedCount !== 1) {
    throw new AccountDeletionError('Account could not be deleted. Please try again.');
  }

  return {
    razorpayBilling: results[0].deletedCount || 0,
    progress: results[1].deletedCount || 0,
    courseProgress: results[2].deletedCount || 0,
    lessonNotes: results[3].deletedCount || 0,
    notifications: results[4].deletedCount || 0,
    wishlists: results[5].deletedCount || 0,
    reviews: results[6].deletedCount || 0,
    certificates: results[7].deletedCount || 0,
    aiTutorSessions: results[8].deletedCount || 0,
    contactEnquiries: results[9].deletedCount || 0,
    analyticsEvents: results[10].deletedCount || 0,
    orders: results[11].deletedCount || 0,
    subscriptionEvents: results[12].deletedCount || 0,
    subscriptions: results[13].deletedCount || 0,
    sessions: results[14].deletedCount || 0,
    learningProgress: results[15].deletedCount || 0,
    assessments: results[16].deletedCount || 0,
  };
}

module.exports = {
  AccountDeletionError,
  deleteUserAccount,
};
