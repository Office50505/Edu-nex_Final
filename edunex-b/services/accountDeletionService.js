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
const AppleSubscription = require('../models/AppleSubscription');
const AppleTransaction = require('../models/AppleTransaction');
const GooglePlaySubscription = require('../models/GooglePlaySubscription');
const BillingCancellationJob = require('../models/BillingCancellationJob');
const DownloadGrant = require('../models/DownloadGrant');
const AiResponseReport = require('../models/AiResponseReport');
const crypto = require('node:crypto');
const { deleteProfileImage } = require('./profileImageStorage');

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
 * Access is revoked before provider cancellation or data cleanup. Provider failures
 * are queued for retry and never keep the user's account active.
 */
async function deleteUserAccount(userId, options = {}) {
  const user = await User.findById(userId).select('_id +avatarStorageKey');
  if (!user) {
    return { alreadyDeleted: true };
  }

  const billing = await RazorpayBilling.findById(userId);
  const userIdString = String(user._id);
  const subscriptions = await Subscription.find({ user: user._id })
    .select('_id phonePeMandateId status gateway razorpaySubscriptionId razorpayMode')
    .lean();
  const subscriptionIds = subscriptions.map((subscription) => subscription._id);
  const accountReferenceHash = crypto
    .createHmac('sha256', process.env.ACCOUNT_DELETION_HASH_SECRET || process.env.JWT_SECRET || 'development-only')
    .update(userIdString)
    .digest('hex');

  // Revoke application access first. Billing providers must never keep an account usable
  // while cancellation or deletion cleanup is pending.
  await Promise.all([
    User.updateOne({ _id: user._id }, {
      $set: {
        isActive: false,
        deviceToken: null,
        activeSessionId: null,
        activeSessions: [],
        aiConsentGranted: false,
      },
    }),
    Session.updateMany(
      { user: user._id, loggedOutAt: null },
      { $set: { loggedOutAt: new Date(), deviceToken: null, refreshTokenHash: null } }
    ),
  ]);

  let billingCancellationQueued = false;
  if (!options.skipBillingCancellation) {
    try {
      await require('./cancelAccountBilling').cancelAccountBilling(billing, subscriptions);
    } catch (error) {
      const cancellationTargets = [
        ...(billing?.subscriptionId ? [{ provider: 'razorpay', referenceId: billing.subscriptionId, mode: billing.mode || null }] : []),
        ...subscriptions.flatMap(subscription => [
          ...(subscription.razorpaySubscriptionId ? [{ provider: 'razorpay', referenceId: subscription.razorpaySubscriptionId, mode: subscription.razorpayMode || null }] : []),
          ...(subscription.phonePeMandateId && subscription.gateway !== 'razorpay' && subscription.gateway !== 'simulated' && !/^SIM_MANDATE_/.test(subscription.phonePeMandateId)
            ? [{ provider: 'phonepe', referenceId: subscription.phonePeMandateId, mode: null }]
            : []),
        ]),
      ];
      await BillingCancellationJob.create({
        accountReferenceHash,
        provider: [...new Set(cancellationTargets.map(item => item.provider))].length > 1
          ? 'mixed'
          : cancellationTargets[0]?.provider || 'unknown',
        providerReferenceIds: cancellationTargets.map(item => item.referenceId),
        cancellationTargets,
        status: 'pending',
        attempts: 1,
        nextAttemptAt: new Date(Date.now() + 15 * 60 * 1000),
        lastErrorCode: String(error?.code || error?.name || 'PROVIDER_CANCELLATION_FAILED').slice(0, 120),
        lastErrorAt: new Date(),
      });
      billingCancellationQueued = true;
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
    Order.updateMany(
      { user: user._id },
      {
        $set: { retainedAccountHash: accountReferenceHash, accountDeletedAt: new Date(), phonePeCustomerId: null },
        $unset: { user: 1, subscription: 1, coupon: 1 },
      }
    ),
    SubscriptionEvent.deleteMany({
      $or: [
        { user: user._id },
        { subscription: { $in: subscriptionIds } },
      ],
    }),
    Subscription.deleteMany({ user: user._id }),
    Session.deleteMany({ user: user._id }),
    AppleTransaction.updateMany(
      { user: user._id },
      { $set: { retainedAccountHash: accountReferenceHash, accountDeletedAt: new Date() }, $unset: { user: 1 } }
    ),
    AppleSubscription.deleteMany({ user: user._id }),
    GooglePlaySubscription.deleteMany({ user: user._id }),
    require('../models/LearningProgress').deleteMany({ userId: userIdString }),
    require('../models/AssessmentResult').deleteMany({ userId: userIdString }),
    require('../models/OnboardingSession').deleteMany({ _id: user._id }),
    DownloadGrant.deleteMany({ user: user._id }),
    AiResponseReport.deleteMany({ user: user._id }),
  ]);

  if (user.avatarStorageKey) await deleteProfileImage(user.avatarStorageKey).catch(() => {});

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
    ordersAnonymized: results[11].modifiedCount || 0,
    subscriptionEvents: results[12].deletedCount || 0,
    subscriptions: results[13].deletedCount || 0,
    sessions: results[14].deletedCount || 0,
    appleTransactionsAnonymized: results[15].modifiedCount || 0,
    appleSubscriptions: results[16].deletedCount || 0,
    googlePlaySubscriptions: results[17].deletedCount || 0,
    learningProgress: results[18].deletedCount || 0,
    assessments: results[19].deletedCount || 0,
    onboardingSessions: results[20].deletedCount || 0,
    downloadGrants: results[21].deletedCount || 0,
    aiResponseReports: results[22].deletedCount || 0,
    billingCancellationQueued,
  };
}

module.exports = {
  AccountDeletionError,
  deleteUserAccount,
};
