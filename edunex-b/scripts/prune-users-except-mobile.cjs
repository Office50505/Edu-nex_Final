#!/usr/bin/env node
require('dotenv').config();
const mongoose = require('mongoose');
const { getMongoConnectionOptions } = require('../config/mongodb');

const User = require('../models/User');
const AdminUserAction = require('../models/AdminUserAction');
const AiTutorSession = require('../models/AiTutorSession');
const AnalyticsEvent = require('../models/AnalyticsEvent');
const AssessmentResult = require('../models/AssessmentResult');
const BillingWebhook = require('../models/BillingWebhook');
const Certificate = require('../models/Certificate');
const ContactEnquiry = require('../models/ContactEnquiry');
const CourseProgress = require('../models/CourseProgress');
const DeletionRequest = require('../models/DeletionRequest');
const LearningProgress = require('../models/LearningProgress');
const LessonNote = require('../models/LessonNote');
const Notification = require('../models/Notification');
const OnboardingSession = require('../models/OnboardingSession');
const Order = require('../models/Order');
const OtpAttempt = require('../models/OtpAttempt');
const PhonePeEventClaim = require('../models/PhonePeEventClaim');
const ProblemReport = require('../models/ProblemReport');
const Progress = require('../models/Progress');
const RazorpayBilling = require('../models/RazorpayBilling');
const Review = require('../models/Review');
const Session = require('../models/Session');
const Subscription = require('../models/Subscription');
const SubscriptionEvent = require('../models/SubscriptionEvent');
const Wishlist = require('../models/Wishlist');

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const keepMobile = process.env.KEEP_MOBILE || process.argv.find(a => a.startsWith('--mobile='))?.split('=')[1] || '9826678668';
const expectedName = (process.env.KEEP_NAME || process.argv.find(a => a.startsWith('--name='))?.split('=')[1] || 'malik').toLowerCase();

function cleanPhone(value) { return String(value || '').replace(/\D/g, '').slice(-10); }
function objectId(value) { return new mongoose.Types.ObjectId(String(value)); }
async function countAndMaybeDelete(label, Model, filter) {
  const count = await Model.countDocuments(filter);
  let deleted = 0;
  if (apply && count) deleted = (await Model.deleteMany(filter)).deletedCount || 0;
  return { label, count, deleted };
}

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/edunex';
  if (!/^mongodb(\+srv)?:\/\//.test(uri)) throw new Error('MONGODB_URI is missing or invalid.');
  await mongoose.connect(uri, getMongoConnectionOptions());

  const keepUsers = await User.find({ mobileNumber: { $in: [keepMobile, cleanPhone(keepMobile), `+91${cleanPhone(keepMobile)}`] } }).lean();
  const matchingByCleanPhone = keepUsers.filter(user => cleanPhone(user.mobileNumber) === cleanPhone(keepMobile));
  if (matchingByCleanPhone.length !== 1) throw new Error(`Expected exactly one user with mobile ${keepMobile}, found ${matchingByCleanPhone.length}.`);
  const keepUser = matchingByCleanPhone[0];
  const keepName = String(keepUser.fullName || '').toLowerCase();
  if (expectedName && !keepName.includes(expectedName)) throw new Error(`Kept mobile belongs to '${keepUser.fullName || 'unnamed'}', not expected name '${expectedName}'.`);

  const keepUserId = String(keepUser._id);
  const keepObjectId = objectId(keepUserId);
  const keepSubscriptionIds = (await Subscription.find({ user: keepObjectId }).distinct('_id')).map(String);
  const keepSubscriptionObjectIds = keepSubscriptionIds.map(objectId);
  const keepOrderIds = (await Order.find({ user: keepObjectId }).distinct('_id')).map(String);
  const keepOrderObjectIds = keepOrderIds.map(objectId);
  const keepMobileClean = cleanPhone(keepMobile);
  const keepEmail = String(keepUser.email || '').toLowerCase();

  const operations = [
    ['Users except kept user', User, { _id: { $ne: keepObjectId } }],
    ['Onboarding sessions except kept mobile', OnboardingSession, { mobileNumber: { $nin: [keepMobile, keepMobileClean, `+91${keepMobileClean}`] } }],
    ['OTP attempts except kept mobile', OtpAttempt, { _id: { $nin: [keepMobile, keepMobileClean, `+91${keepMobileClean}`] } }],
    ['Subscriptions except kept user', Subscription, { user: { $ne: keepObjectId } }],
    ['Subscription events except kept user/subscription', SubscriptionEvent, { user: { $ne: keepObjectId }, subscription: { $nin: keepSubscriptionObjectIds } }],
    ['Orders except kept user/subscription', Order, { user: { $ne: keepObjectId }, subscription: { $nin: keepSubscriptionObjectIds } }],
    ['Razorpay billing except kept user', RazorpayBilling, { _id: { $ne: keepObjectId } }],
    ['Admin user actions except kept user', AdminUserAction, { user: { $ne: keepObjectId } }],
    ['AI tutor sessions except kept user', AiTutorSession, { user: { $ne: keepObjectId } }],
    ['Lesson notes except kept user', LessonNote, { user: { $ne: keepObjectId } }],
    ['Notifications except kept user', Notification, { recipient: { $ne: keepObjectId } }],
    ['Progress rows except kept user', Progress, { user: { $ne: keepObjectId } }],
    ['Reviews except kept user/subscription', Review, { user: { $ne: keepObjectId }, subscription: { $nin: keepSubscriptionObjectIds } }],
    ['Wishlist except kept user', Wishlist, { user: { $ne: keepObjectId } }],
    ['Learning progress except kept user', LearningProgress, { userId: { $ne: keepUserId } }],
    ['Course progress except kept user', CourseProgress, { userId: { $ne: keepUserId } }],
    ['Assessment results except kept user', AssessmentResult, { userId: { $ne: keepUserId } }],
    ['Certificates except kept user', Certificate, { userId: { $ne: keepUserId } }],
    ['Problem reports except kept user/mobile/email', ProblemReport, { $and: [{ $or: [{ userId: { $ne: keepObjectId } }, { userId: null }] }, { reporterMobileNumber: { $nin: [keepMobile, keepMobileClean, `+91${keepMobileClean}`] } }, ...(keepEmail ? [{ reporterEmail: { $ne: keepEmail } }] : [])] }],
    ['Contact enquiries except kept user/email', ContactEnquiry, { $and: [{ $or: [{ userId: { $ne: keepObjectId } }, { userId: null }] }, ...(keepEmail ? [{ email: { $ne: keepEmail } }] : [])] }],
    ['Deletion requests except kept mobile/email', DeletionRequest, { mobileNumber: { $nin: [keepMobile, keepMobileClean, `+91${keepMobileClean}`] }, ...(keepEmail ? { email: { $ne: keepEmail } } : {}) }],
    ['Analytics except kept user', AnalyticsEvent, { userId: { $ne: keepUserId } }],
    ['Billing webhooks (global provider metadata)', BillingWebhook, {}],
    ['PhonePe event claims (global provider metadata)', PhonePeEventClaim, {}],
  ];

  const results = [];
  for (const [label, Model, filter] of operations) results.push(await countAndMaybeDelete(label, Model, filter));

  const summary = {
    mode: apply ? 'APPLY_DELETE' : 'DRY_RUN',
    keptUser: { _id: keepUserId, fullName: keepUser.fullName, mobileNumber: keepUser.mobileNumber, email: keepUser.email || null },
    preserved: { subscriptions: keepSubscriptionIds.length, orders: keepOrderIds.length },
    results,
  };
  console.log(JSON.stringify(summary, null, 2));
  await mongoose.disconnect();
}

main().catch(async error => {
  console.error(error.message);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
