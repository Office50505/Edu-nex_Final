const mongoose = require('mongoose');

const PRESENT = { $exists: true, $nin: [null, ''] };
const ACTIVE_PHONEPE_STATUSES = ['1rs trial', 'trial', 'active', 'subscribed'];

const COLLECTIONS = Object.freeze({
  users: 'users',
  orders: 'orders',
  subscriptions: 'subscriptions',
  subscriptionEvents: 'subscriptionevents',
  sessions: 'sessions',
  adminUserActions: 'adminuseractions',
  aiTutorSessions: 'aitutorsessions',
  analyticsEvents: 'analytics',
  assessmentResults: 'assessmentresults',
  certificates: 'certificates',
  contactEnquiries: 'contactenquiries',
  courseProgress: 'courseProgress',
  deletionRequests: 'deletionrequests',
  learningProgress: 'learningprogresses',
  lessonNotes: 'lessonnotes',
  notifications: 'notifications',
  onboardingSessions: 'onboardingsessions',
  otpAttempts: 'otpattempts',
  otpSessions: 'otp_sessions',
  problemReports: 'problemreports',
  progress: 'progresses',
  reviews: 'reviews',
  wishlists: 'wishlists',
  razorpayBillings: 'razorpaybillings',
});

const PHONEPE_ORDER_FILTER = { gateway: 'phonepe' };
const PHONEPE_SUBSCRIPTION_FILTER = {
  $or: [
    { gateway: 'phonepe' },
    {
      gateway: { $exists: false },
      $or: [
        { phonePeMerchantId: PRESENT },
        { phonePeSubscriptionId: PRESENT },
        { phonePeMandateId: PRESENT },
        { phonePeAuthRequestId: PRESENT },
      ],
    },
  ],
};
const PHONEPE_EVENT_FILTER = {
  'metadata.provider': { $ne: 'simulated' },
  phonePeTransactionId: { $not: /^SIM_/ },
};

function stringId(value) {
  return value == null ? null : String(value);
}

function uniqueObjectIds(values) {
  const ids = new Map();
  for (const value of values) {
    const text = stringId(value);
    if (text && mongoose.isValidObjectId(text)) ids.set(text, new mongoose.Types.ObjectId(text));
  }
  return [...ids.values()];
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => value != null && String(value).trim()).map(String))];
}

function emptyResult() {
  return {
    mode: 'dry-run',
    users: 0,
    candidateIdentityReferences: 0,
    orphanedIdentityReferences: 0,
    orders: 0,
    subscriptions: 0,
    subscriptionEvents: 0,
    phonePeEventClaims: 0,
    otherRecords: 0,
    otherRecordsByCollection: {},
    collectionNames: [],
    activePhonePeSubscriptions: 0,
    pendingPhonePeSubscriptions: 0,
    pendingPhonePeOrders: 0,
    historicalPhonePeOrders: 0,
    historicalPhonePeEvents: 0,
    safetyConflicts: {
      users: 0,
      razorpayProductionBilling: 0,
      googlePlayBilling: 0,
      appleBilling: 0,
      unrelatedPurchaseHistory: 0,
    },
    safeToDelete: true,
  };
}

async function find(collection, filter, projection) {
  return collection.find(filter, { projection }).toArray();
}

async function count(collection, filter) {
  return collection.countDocuments(filter);
}

async function auditPhonePeCleanup(db) {
  const ordersCollection = db.collection(COLLECTIONS.orders);
  const subscriptionsCollection = db.collection(COLLECTIONS.subscriptions);
  const eventsCollection = db.collection(COLLECTIONS.subscriptionEvents);
  const usersCollection = db.collection(COLLECTIONS.users);

  const [phonePeOrders, phonePeSubscriptions, phonePeEvents, phonePeUsers] = await Promise.all([
    find(ordersCollection, PHONEPE_ORDER_FILTER, { _id: 1, user: 1, subscription: 1, status: 1 }),
    find(subscriptionsCollection, PHONEPE_SUBSCRIPTION_FILTER, { _id: 1, user: 1, status: 1 }),
    find(eventsCollection, PHONEPE_EVENT_FILTER, { _id: 1, user: 1, subscription: 1 }),
    find(usersCollection, { phonePeCustomerId: PRESENT }, { _id: 1 }),
  ]);

  const candidateIds = uniqueObjectIds([
    ...phonePeOrders.map((record) => record.user),
    ...phonePeSubscriptions.map((record) => record.user),
    ...phonePeEvents.map((record) => record.user),
    ...phonePeUsers.map((record) => record._id),
  ]);
  if (!candidateIds.length) return emptyResult();

  const candidateStrings = candidateIds.map(String);
  const candidateUsers = await find(usersCollection, { _id: { $in: candidateIds } }, {
    _id: 1,
    email: 1,
    mobileNumber: 1,
    purchasedCourses: 1,
    courseEntitlements: 1,
  });
  const emails = uniqueStrings(candidateUsers.map((user) => user.email));
  const mobiles = uniqueStrings(candidateUsers.map((user) => user.mobileNumber));
  const allCandidateSubscriptions = await find(
    subscriptionsCollection,
    { user: { $in: candidateIds } },
    { _id: 1, user: 1, gateway: 1, razorpayMode: 1 }
  );
  const subscriptionIds = allCandidateSubscriptions.map((record) => record._id);

  const primaryCounts = {
    orders: await count(ordersCollection, { user: { $in: candidateIds } }),
    subscriptions: allCandidateSubscriptions.length,
    subscriptionEvents: await count(eventsCollection, {
      $or: [
        { user: { $in: candidateIds } },
        { subscription: { $in: subscriptionIds } },
      ],
    }),
  };

  const relatedQueries = {
    [COLLECTIONS.sessions]: { user: { $in: candidateIds } },
    [COLLECTIONS.adminUserActions]: { user: { $in: candidateIds } },
    [COLLECTIONS.aiTutorSessions]: { user: { $in: candidateIds } },
    [COLLECTIONS.analyticsEvents]: {
      $or: [
        { user: { $in: candidateIds } },
        { userId: { $in: [...candidateIds, ...candidateStrings] } },
      ],
    },
    [COLLECTIONS.assessmentResults]: { userId: { $in: candidateStrings } },
    [COLLECTIONS.certificates]: { userId: { $in: candidateStrings } },
    [COLLECTIONS.contactEnquiries]: {
      $or: [
        { userId: { $in: candidateIds } },
        ...(emails.length ? [{ email: { $in: emails } }] : []),
      ],
    },
    [COLLECTIONS.courseProgress]: {
      $or: [
        { userId: { $in: candidateStrings } },
        ...(emails.length ? [{ userEmail: { $in: emails } }] : []),
        ...(mobiles.length ? [{ userMobileNumber: { $in: mobiles } }] : []),
      ],
    },
    [COLLECTIONS.deletionRequests]: {
      $or: [
        ...(emails.length ? [{ email: { $in: emails } }] : []),
        ...(mobiles.length ? [{ mobileNumber: { $in: mobiles } }] : []),
      ],
    },
    [COLLECTIONS.learningProgress]: { userId: { $in: candidateStrings } },
    [COLLECTIONS.lessonNotes]: { user: { $in: candidateIds } },
    [COLLECTIONS.notifications]: { recipient: { $in: candidateIds } },
    [COLLECTIONS.onboardingSessions]: { mobileNumber: { $in: mobiles } },
    [COLLECTIONS.otpAttempts]: { _id: { $in: mobiles } },
    [COLLECTIONS.otpSessions]: { mobile: { $in: mobiles } },
    [COLLECTIONS.problemReports]: {
      $or: [
        { userId: { $in: candidateIds } },
        ...(emails.length ? [{ reporterEmail: { $in: emails } }] : []),
      ],
    },
    [COLLECTIONS.progress]: { user: { $in: candidateIds } },
    [COLLECTIONS.reviews]: { user: { $in: candidateIds } },
    [COLLECTIONS.wishlists]: { user: { $in: candidateIds } },
  };

  const existingCollections = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((entry) => entry.name)
  );
  const otherRecordsByCollection = {};
  for (const [collectionName, query] of Object.entries(relatedQueries)) {
    if (!existingCollections.has(collectionName) || query.$or?.length === 0) continue;
    const records = await count(db.collection(collectionName), query);
    if (records) otherRecordsByCollection[collectionName] = records;
  }

  const candidateOrders = await find(
    ordersCollection,
    { user: { $in: candidateIds } },
    { user: 1, gateway: 1, razorpayMode: 1, status: 1 }
  );
  const razorpayBillings = existingCollections.has(COLLECTIONS.razorpayBillings)
    ? await find(db.collection(COLLECTIONS.razorpayBillings), { _id: { $in: candidateIds } }, { _id: 1, mode: 1 })
    : [];

  const conflictUsers = new Set();
  const productionRazorpayUsers = new Set();
  for (const record of razorpayBillings) {
    if (String(record.mode || '').toLowerCase() !== 'test') productionRazorpayUsers.add(stringId(record._id));
  }
  for (const record of candidateOrders) {
    if (String(record.gateway || '').toLowerCase() === 'razorpay' && String(record.razorpayMode || '').toLowerCase() !== 'test') {
      productionRazorpayUsers.add(stringId(record.user));
    }
  }
  for (const record of allCandidateSubscriptions) {
    if (String(record.gateway || '').toLowerCase() === 'razorpay' && String(record.razorpayMode || '').toLowerCase() !== 'test') {
      productionRazorpayUsers.add(stringId(record.user));
    }
  }
  productionRazorpayUsers.forEach((id) => conflictUsers.add(id));

  const googlePlayUsers = new Set();
  const appleUsers = new Set();
  for (const record of [...candidateOrders, ...allCandidateSubscriptions]) {
    const gateway = String(record.gateway || '').trim().toLowerCase();
    if (['google', 'google_play', 'googleplay', 'play_store', 'playstore'].includes(gateway)) {
      googlePlayUsers.add(stringId(record.user));
    }
    if (['apple', 'app_store', 'appstore', 'apple_iap', 'ios_iap'].includes(gateway)) {
      appleUsers.add(stringId(record.user));
    }
  }
  const mobileBillingCollections = [...existingCollections].filter((name) =>
    /(google.*play|play.*billing|apple.*billing|appstore|appleiap|iosiap)/i.test(name)
  );
  for (const collectionName of mobileBillingCollections) {
    const records = await find(db.collection(collectionName), {
      $or: [
        { user: { $in: candidateIds } },
        { userId: { $in: [...candidateIds, ...candidateStrings] } },
        { _id: { $in: candidateIds } },
      ],
    }, { _id: 1, user: 1, userId: 1 });
    const target = /google|play/i.test(collectionName) ? googlePlayUsers : appleUsers;
    records.forEach((record) => target.add(stringId(record.user || record.userId || record._id)));
  }
  googlePlayUsers.forEach((id) => conflictUsers.add(id));
  appleUsers.forEach((id) => conflictUsers.add(id));

  const unrelatedPurchaseUsers = new Set(
    candidateUsers
      .filter((user) => (user.purchasedCourses || []).length || (user.courseEntitlements || []).length)
      .map((user) => stringId(user._id))
  );
  if (existingCollections.has(COLLECTIONS.adminUserActions)) {
    const grants = await find(db.collection(COLLECTIONS.adminUserActions), {
      user: { $in: candidateIds },
      action: { $in: ['subscription_granted', 'course_granted'] },
    }, { user: 1 });
    grants.forEach((record) => unrelatedPurchaseUsers.add(stringId(record.user)));
  }
  for (const record of candidateOrders) {
    const gateway = String(record.gateway || '').trim().toLowerCase();
    if (record.status === 'paid' && !['phonepe', 'simulated', 'razorpay'].includes(gateway)) {
      unrelatedPurchaseUsers.add(stringId(record.user));
    }
  }
  for (const record of allCandidateSubscriptions) {
    const gateway = String(record.gateway || '').trim().toLowerCase();
    if (gateway && !['phonepe', 'simulated', 'razorpay'].includes(gateway)) {
      unrelatedPurchaseUsers.add(stringId(record.user));
    }
  }
  unrelatedPurchaseUsers.forEach((id) => conflictUsers.add(id));

  const phonePeEventClaims = existingCollections.has('phonepeeventclaims')
    ? await count(db.collection('phonepeeventclaims'), {})
    : 0;
  const otherRecords = Object.values(otherRecordsByCollection).reduce((sum, value) => sum + value, 0);

  return {
    mode: 'dry-run',
    users: candidateUsers.length,
    candidateIdentityReferences: candidateIds.length,
    orphanedIdentityReferences: candidateIds.length - candidateUsers.length,
    ...primaryCounts,
    phonePeEventClaims,
    otherRecords,
    otherRecordsByCollection,
    collectionNames: [
      COLLECTIONS.users,
      COLLECTIONS.orders,
      COLLECTIONS.subscriptions,
      COLLECTIONS.subscriptionEvents,
      ...Object.keys(otherRecordsByCollection),
      ...(phonePeEventClaims ? ['phonepeeventclaims'] : []),
    ],
    activePhonePeSubscriptions: phonePeSubscriptions.filter((record) => ACTIVE_PHONEPE_STATUSES.includes(record.status)).length,
    pendingPhonePeSubscriptions: phonePeSubscriptions.filter((record) => record.status === 'pending').length,
    pendingPhonePeOrders: phonePeOrders.filter((record) => record.status === 'pending').length,
    historicalPhonePeOrders: phonePeOrders.length,
    historicalPhonePeEvents: phonePeEvents.length,
    safetyConflicts: {
      users: conflictUsers.size,
      razorpayProductionBilling: productionRazorpayUsers.size,
      googlePlayBilling: googlePlayUsers.size,
      appleBilling: appleUsers.size,
      unrelatedPurchaseHistory: unrelatedPurchaseUsers.size,
    },
    safeToDelete: conflictUsers.size === 0,
  };
}

module.exports = {
  ACTIVE_PHONEPE_STATUSES,
  COLLECTIONS,
  PHONEPE_EVENT_FILTER,
  PHONEPE_ORDER_FILTER,
  PHONEPE_SUBSCRIPTION_FILTER,
  auditPhonePeCleanup,
};
