#!/usr/bin/env node
'use strict';

require('dotenv').config();
const mongoose = require('mongoose');

const apply = process.argv.includes('--apply');
const confirmArg = process.argv.find((arg) => arg.startsWith('--confirm='));
const confirmed = confirmArg === '--confirm=DELETE_USER_DATA_ONLY';

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error('Missing MONGODB_URI in environment.');
  process.exit(1);
}

const models = [
  ['User', '../models/User'],
  ['OnboardingSession', '../models/OnboardingSession'],
  ['OtpAttempt', '../models/OtpAttempt'],
  ['Subscription', '../models/Subscription'],
  ['SubscriptionEvent', '../models/SubscriptionEvent'],
  ['Order', '../models/Order'],
  ['RazorpayBilling', '../models/RazorpayBilling'],
  ['AdminUserAction', '../models/AdminUserAction'],
  ['AiTutorSession', '../models/AiTutorSession'],
  ['LessonNote', '../models/LessonNote'],
  ['Notification', '../models/Notification'],
  ['Progress', '../models/Progress'],
  ['Review', '../models/Review'],
  ['Wishlist', '../models/Wishlist'],
  ['LearningProgress', '../models/LearningProgress'],
  ['CourseProgress', '../models/CourseProgress'],
  ['AssessmentResult', '../models/AssessmentResult'],
  ['Certificate', '../models/Certificate'],
  ['ProblemReport', '../models/ProblemReport'],
  ['ContactEnquiry', '../models/ContactEnquiry'],
  ['DeletionRequest', '../models/DeletionRequest'],
  ['AnalyticsEvent', '../models/AnalyticsEvent'],
];

function loadModel(name, path) {
  try {
    require(path);
    return mongoose.model(name);
  } catch (error) {
    if (error && error.name === 'MissingSchemaError') return null;
    if (error && error.code === 'MODULE_NOT_FOUND') return null;
    throw error;
  }
}

function objectIdsFrom(values) {
  return [...new Set(values.filter(Boolean).map(String))]
    .filter((value) => mongoose.Types.ObjectId.isValid(value))
    .map((value) => new mongoose.Types.ObjectId(value));
}

function compactStrings(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

async function countOrDelete(Model, filter, label) {
  if (!Model || !filter) return null;
  const count = await Model.countDocuments(filter);
  if (!apply) return { label, count };
  const result = await Model.deleteMany(filter);
  return { label, count, deleted: result.deletedCount || 0 };
}

async function main() {
  if (apply && !confirmed) {
    console.error('Refusing to delete. Re-run with --apply --confirm=DELETE_USER_DATA_ONLY');
    process.exit(1);
  }

  await mongoose.connect(mongoUri, {
    dbName: process.env.MONGODB_DB || undefined,
    serverSelectionTimeoutMS: 15000,
  });

  const loaded = Object.fromEntries(models.map(([name, path]) => [name, loadModel(name, path)]));
  if (!loaded.User) throw new Error('User model could not be loaded.');

  const users = await loaded.User.find({}, {
    _id: 1,
    email: 1,
    mobileNumber: 1,
    phone: 1,
    phoneNumber: 1,
    subscription: 1,
    currentSubscription: 1,
    activeSubscription: 1,
  }).lean();

  const userIds = compactStrings(users.map((user) => user._id));
  const userObjectIds = objectIdsFrom(userIds);
  const emails = compactStrings(users.map((user) => user.email).map((email) => String(email || '').toLowerCase()));
  const mobiles = compactStrings(users.flatMap((user) => [user.mobileNumber, user.phone, user.phoneNumber]));

  const subscriptionIdsFromUsers = compactStrings(users.flatMap((user) => [
    user.subscription,
    user.currentSubscription,
    user.activeSubscription,
  ]));

  const subscriptionFilter = userObjectIds.length ? { user: { $in: userObjectIds } } : { _id: { $exists: false } };
  const subscriptionDocs = loaded.Subscription
    ? await loaded.Subscription.find(subscriptionFilter, { _id: 1, razorpaySubscriptionId: 1 }).lean()
    : [];
  const subscriptionIds = compactStrings([
    ...subscriptionIdsFromUsers,
    ...subscriptionDocs.map((sub) => sub._id),
    ...subscriptionDocs.map((sub) => sub.razorpaySubscriptionId),
  ]);
  const subscriptionObjectIds = objectIdsFrom(subscriptionIds);

  const empty = { _id: { $exists: false } };
  const userObjectFilter = userObjectIds.length ? { $in: userObjectIds } : [];
  const subscriptionObjectFilter = subscriptionObjectIds.length ? { $in: subscriptionObjectIds } : [];

  const operations = [
    [loaded.AdminUserAction, userObjectIds.length ? { user: userObjectFilter } : empty, 'Admin user actions tied to users'],
    [loaded.AiTutorSession, userObjectIds.length ? { user: userObjectFilter } : empty, 'AI tutor sessions tied to users'],
    [loaded.LessonNote, userObjectIds.length ? { user: userObjectFilter } : empty, 'Lesson notes tied to users'],
    [loaded.Notification, userObjectIds.length ? { recipient: userObjectFilter } : empty, 'Notifications sent to users'],
    [loaded.Progress, userObjectIds.length ? { user: userObjectFilter } : empty, 'Progress rows tied to users'],
    [loaded.Review, userObjectIds.length || subscriptionObjectIds.length ? {
      $or: [
        ...(userObjectIds.length ? [{ user: userObjectFilter }] : []),
        ...(subscriptionObjectIds.length ? [{ subscription: subscriptionObjectFilter }] : []),
      ],
    } : empty, 'Reviews tied to users/subscriptions'],
    [loaded.Wishlist, userObjectIds.length ? { user: userObjectFilter } : empty, 'Wishlists tied to users'],
    [loaded.LearningProgress, userIds.length ? { userId: { $in: userIds } } : empty, 'Learning progress tied to users'],
    [loaded.CourseProgress, userIds.length ? { userId: { $in: userIds } } : empty, 'Course progress tied to users'],
    [loaded.AssessmentResult, userIds.length ? { userId: { $in: userIds } } : empty, 'Assessment results tied to users'],
    [loaded.Certificate, userIds.length ? { userId: { $in: userIds } } : empty, 'Certificates tied to users'],
    [loaded.ProblemReport, userObjectIds.length || emails.length || mobiles.length ? {
      $or: [
        ...(userObjectIds.length ? [{ userId: userObjectFilter }] : []),
        ...(emails.length ? [{ reporterEmail: { $in: emails } }] : []),
        ...(mobiles.length ? [{ reporterMobileNumber: { $in: mobiles } }] : []),
      ],
    } : empty, 'Problem reports tied to users'],
    [loaded.ContactEnquiry, userObjectIds.length || emails.length ? {
      $or: [
        ...(userObjectIds.length ? [{ userId: userObjectFilter }] : []),
        ...(emails.length ? [{ email: { $in: emails } }] : []),
      ],
    } : empty, 'Contact enquiries tied to users'],
    [loaded.DeletionRequest, emails.length || mobiles.length ? {
      $or: [
        ...(emails.length ? [{ email: { $in: emails } }] : []),
        ...(mobiles.length ? [{ mobileNumber: { $in: mobiles } }] : []),
      ],
    } : empty, 'Deletion requests tied to users'],
    [loaded.SubscriptionEvent, userObjectIds.length || subscriptionObjectIds.length ? {
      $or: [
        ...(userObjectIds.length ? [{ user: userObjectFilter }] : []),
        ...(subscriptionObjectIds.length ? [{ subscription: subscriptionObjectFilter }] : []),
      ],
    } : empty, 'Subscription events tied to users/subscriptions'],
    [loaded.Order, userObjectIds.length || subscriptionObjectIds.length ? {
      $or: [
        ...(userObjectIds.length ? [{ user: userObjectFilter }] : []),
        ...(subscriptionObjectIds.length ? [{ subscription: subscriptionObjectFilter }] : []),
      ],
    } : empty, 'Orders tied to users/subscriptions'],
    [loaded.Subscription, userObjectIds.length ? { user: userObjectFilter } : empty, 'Subscriptions tied to users'],
    [loaded.RazorpayBilling, userObjectIds.length ? { _id: userObjectFilter } : empty, 'Razorpay billing profiles tied to users'],
    [loaded.OnboardingSession, mobiles.length ? { mobileNumber: { $in: mobiles } } : empty, 'Onboarding sessions tied to user mobiles'],
    [loaded.OtpAttempt, mobiles.length ? { _id: { $in: mobiles } } : empty, 'OTP attempts tied to user mobiles'],
    [loaded.AnalyticsEvent, userIds.length ? { userId: { $in: userIds } } : empty, 'Analytics events with userId'],
    [loaded.User, userObjectIds.length ? { _id: userObjectFilter } : empty, 'Users'],
  ];

  const results = [];
  for (const [Model, filter, label] of operations) {
    const result = await countOrDelete(Model, filter, label);
    if (result) results.push(result);
  }

  const remainingUsers = await loaded.User.countDocuments({});

  console.log(JSON.stringify({
    mode: apply ? 'APPLY' : 'DRY_RUN',
    database: mongoose.connection.name,
    host: mongoose.connection.host,
    usersMatchedBeforeRun: users.length,
    remainingUsers,
    preserved: [
      'Razorpay/PhonePe webhook delivery history',
      'global anonymous analytics without userId',
      'provider-side Razorpay payments/subscriptions',
    ],
    results,
  }, null, 2));

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error && error.stack ? error.stack : error);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
