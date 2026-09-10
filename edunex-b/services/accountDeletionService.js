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
async function deleteUserAccount(userId) {
  const user = await User.findById(userId).select('_id');
  if (!user) {
    throw new AccountDeletionError('Account not found', 404, 'ACCOUNT_NOT_FOUND');
  }

  const billing = await RazorpayBilling.findById(userId);
  if (billing && billing.phase !== 'closed') throw new AccountDeletionError('Cancel your Razorpay mandate before deleting your account. For unresolved checkout, contact support.', 409, 'ACTIVE_SUBSCRIPTION');
  const userIdString = String(user._id);
  const subscriptions = await Subscription.find({ user: user._id })
    .select('_id phonePeMandateId status')
    .lean();
  const subscriptionIds = subscriptions.map((subscription) => subscription._id);
  const activeMandate = subscriptions.find((subscription) => subscription.phonePeMandateId);

  // Deleting the local account must never leave a real recurring mandate able
  // to charge a user whose account no longer exists.
  if (activeMandate && process.env.PAYMENT_GATEWAY_MODE !== 'simulated') {
    throw new AccountDeletionError(
      'Cancel your active subscription before deleting your account. Your learning access remains available until the current period ends.',
      409,
      'ACTIVE_SUBSCRIPTION'
    );
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
  ]);

  const deletedUser = await User.deleteOne({ _id: user._id });
  if (deletedUser.deletedCount !== 1) {
    throw new AccountDeletionError('Account could not be deleted. Please try again.');
  }

  return {
    progress: results[0].deletedCount || 0,
    courseProgress: results[1].deletedCount || 0,
    lessonNotes: results[2].deletedCount || 0,
    notifications: results[3].deletedCount || 0,
    wishlists: results[4].deletedCount || 0,
    reviews: results[5].deletedCount || 0,
    certificates: results[6].deletedCount || 0,
    aiTutorSessions: results[7].deletedCount || 0,
    contactEnquiries: results[8].deletedCount || 0,
    analyticsEvents: results[9].deletedCount || 0,
    orders: results[10].deletedCount || 0,
    subscriptionEvents: results[11].deletedCount || 0,
    subscriptions: results[12].deletedCount || 0,
    sessions: results[13].deletedCount || 0,
  };
}

module.exports = {
  AccountDeletionError,
  deleteUserAccount,
};
