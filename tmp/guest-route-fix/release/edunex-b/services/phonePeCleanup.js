const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { EJSON } = require('bson');
const mongoose = require('mongoose');
const {
  COLLECTIONS,
  PHONEPE_EVENT_FILTER,
  PHONEPE_ORDER_FILTER,
  PHONEPE_SUBSCRIPTION_FILTER,
  auditPhonePeCleanup,
} = require('./phonePeCleanupAudit');

const BACKUP_SCHEMA_VERSION = 1;
const USER_COLLECTION = COLLECTIONS.users;

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

async function find(db, collectionName, filter, options = {}) {
  return db.collection(collectionName).find(filter, options).toArray();
}

async function existingCollectionNames(db) {
  return new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((entry) => entry.name));
}

async function resolveCandidateIds(db) {
  const [orders, subscriptions, events, users] = await Promise.all([
    find(db, COLLECTIONS.orders, PHONEPE_ORDER_FILTER, { projection: { user: 1 } }),
    find(db, COLLECTIONS.subscriptions, PHONEPE_SUBSCRIPTION_FILTER, { projection: { user: 1 } }),
    find(db, COLLECTIONS.subscriptionEvents, PHONEPE_EVENT_FILTER, { projection: { user: 1 } }),
    find(db, COLLECTIONS.users, { phonePeCustomerId: { $exists: true, $nin: [null, ''] } }, { projection: { _id: 1 } }),
  ]);
  return uniqueObjectIds([
    ...orders.map((record) => record.user),
    ...subscriptions.map((record) => record.user),
    ...events.map((record) => record.user),
    ...users.map((record) => record._id),
  ]);
}

async function buildCleanupPlan(db) {
  const candidateIds = await resolveCandidateIds(db);
  if (!candidateIds.length) return { candidateIds, documentsByCollection: {}, totalRecords: 0 };

  const candidateStrings = candidateIds.map(String);
  const users = await find(db, COLLECTIONS.users, { _id: { $in: candidateIds } });
  const emails = uniqueStrings(users.map((user) => user.email));
  const mobiles = uniqueStrings(users.map((user) => user.mobileNumber));
  const subscriptions = await find(db, COLLECTIONS.subscriptions, { user: { $in: candidateIds } });
  const subscriptionIds = subscriptions.map((record) => record._id);
  const existing = await existingCollectionNames(db);

  const queries = {
    [COLLECTIONS.users]: { _id: { $in: candidateIds } },
    [COLLECTIONS.orders]: { user: { $in: candidateIds } },
    [COLLECTIONS.subscriptions]: { user: { $in: candidateIds } },
    [COLLECTIONS.subscriptionEvents]: {
      $or: [
        { user: { $in: candidateIds } },
        { subscription: { $in: subscriptionIds } },
      ],
    },
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
  if (existing.has('phonepeeventclaims')) queries.phonepeeventclaims = {};

  const documentsByCollection = {};
  for (const [collectionName, query] of Object.entries(queries)) {
    if (!existing.has(collectionName) || query.$or?.length === 0) continue;
    const documents = await find(db, collectionName, query);
    if (documents.length) documentsByCollection[collectionName] = documents;
  }

  return {
    candidateIds,
    documentsByCollection,
    totalRecords: Object.values(documentsByCollection).reduce((sum, records) => sum + records.length, 0),
  };
}

function createVerifiedBackup(plan, options = {}) {
  const parent = path.resolve(options.parentDirectory || os.tmpdir());
  const repositoryRoot = path.resolve(options.repositoryRoot || path.join(__dirname, '..', '..'));
  if (parent === repositoryRoot || parent.startsWith(`${repositoryRoot}${path.sep}`)) {
    throw new Error('PhonePe cleanup backup must be outside the source repository.');
  }
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  const backupDirectory = fs.mkdtempSync(path.join(parent, 'skillomate-phonepe-cleanup-'));
  fs.chmodSync(backupDirectory, 0o700);

  const lines = [];
  const counts = {};
  for (const [collection, documents] of Object.entries(plan.documentsByCollection)) {
    counts[collection] = documents.length;
    for (const document of documents) lines.push(EJSON.stringify({ collection, document }, { relaxed: false }));
  }
  const payload = Buffer.from(`${lines.join('\n')}\n`, 'utf8');
  const compressed = zlib.gzipSync(payload, { level: 9 });
  const checksum = crypto.createHash('sha256').update(compressed).digest('hex');
  const backupPath = path.join(backupDirectory, 'records.ejsonl.gz');
  const manifestPath = path.join(backupDirectory, 'manifest.json');
  fs.writeFileSync(backupPath, compressed, { mode: 0o600, flag: 'wx' });
  fs.writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    checksumAlgorithm: 'sha256',
    checksum,
    totalRecords: plan.totalRecords,
    counts,
  }, null, 2), { mode: 0o600, flag: 'wx' });

  const stored = fs.readFileSync(backupPath);
  const storedChecksum = crypto.createHash('sha256').update(stored).digest('hex');
  if (storedChecksum !== checksum) throw new Error('PhonePe cleanup backup checksum verification failed.');
  const restoredLines = zlib.gunzipSync(stored).toString('utf8').trim().split('\n').filter(Boolean);
  for (const line of restoredLines) EJSON.parse(line);
  if (restoredLines.length !== plan.totalRecords) throw new Error('PhonePe cleanup backup record-count verification failed.');

  return { backupDirectory, backupPath, manifestPath, checksum, totalRecords: restoredLines.length, verified: true };
}

async function assertSafetyGate(db, candidateIds, session) {
  const options = session ? { session } : {};
  const conflictQueries = [
    [COLLECTIONS.razorpayBillings, { _id: { $in: candidateIds }, mode: { $ne: 'test' } }],
    [COLLECTIONS.orders, { user: { $in: candidateIds }, gateway: 'razorpay', razorpayMode: { $ne: 'test' } }],
    [COLLECTIONS.subscriptions, { user: { $in: candidateIds }, gateway: 'razorpay', razorpayMode: { $ne: 'test' } }],
    [COLLECTIONS.orders, { user: { $in: candidateIds }, gateway: { $in: ['google', 'google_play', 'googleplay', 'play_store', 'playstore', 'apple', 'app_store', 'appstore', 'apple_iap', 'ios_iap'] } }],
    [COLLECTIONS.subscriptions, { user: { $in: candidateIds }, gateway: { $in: ['google', 'google_play', 'googleplay', 'play_store', 'playstore', 'apple', 'app_store', 'appstore', 'apple_iap', 'ios_iap'] } }],
    [COLLECTIONS.users, { _id: { $in: candidateIds }, $or: [{ 'purchasedCourses.0': { $exists: true } }, { 'courseEntitlements.0': { $exists: true } }] }],
    [COLLECTIONS.adminUserActions, { user: { $in: candidateIds }, action: { $in: ['subscription_granted', 'course_granted'] } }],
  ];
  const existing = await existingCollectionNames(db);
  for (const [collectionName, query] of conflictQueries) {
    if (existing.has(collectionName) && await db.collection(collectionName).countDocuments(query, options)) {
      throw new Error('PhonePe cleanup safety gate detected cross-provider or unrelated purchase data.');
    }
  }
}

async function deleteBackedUpPlan(db, plan, session) {
  await assertSafetyGate(db, plan.candidateIds, session);
  const collectionNames = Object.keys(plan.documentsByCollection).sort((left, right) => {
    if (left === USER_COLLECTION) return 1;
    if (right === USER_COLLECTION) return -1;
    return left.localeCompare(right);
  });
  const deletedByCollection = {};
  for (const collectionName of collectionNames) {
    const ids = plan.documentsByCollection[collectionName].map((document) => document._id);
    const result = await db.collection(collectionName).deleteMany({ _id: { $in: ids } }, { session });
    deletedByCollection[collectionName] = result.deletedCount || 0;
  }
  return deletedByCollection;
}

async function executePhonePeCleanup(connection, options = {}) {
  const db = connection.db;
  const before = await auditPhonePeCleanup(db);
  if (!before.candidateIdentityReferences) {
    return { alreadyClean: true, before, after: before, backup: null, deletedByCollection: {} };
  }
  if (!before.safeToDelete) throw new Error('PhonePe cleanup safety gate failed.');
  if (Number(options.expectedUsers) !== before.users) {
    throw new Error(`Expected ${options.expectedUsers} PhonePe test users but found ${before.users}; cleanup aborted.`);
  }

  const plan = await buildCleanupPlan(db);
  if ((plan.documentsByCollection[USER_COLLECTION] || []).length !== before.users) {
    throw new Error('PhonePe cleanup plan does not match the audited user count.');
  }
  const backup = createVerifiedBackup(plan, options);
  if (!backup.verified) throw new Error('PhonePe cleanup backup was not verified.');

  const mongoSession = await connection.startSession();
  let deletedByCollection = {};
  try {
    await mongoSession.withTransaction(async () => {
      deletedByCollection = await deleteBackedUpPlan(db, plan, mongoSession);
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary',
    });
  } finally {
    await mongoSession.endSession();
  }

  const after = await auditPhonePeCleanup(db);
  if (after.users || after.activePhonePeSubscriptions || after.pendingPhonePeSubscriptions || after.pendingPhonePeOrders || after.candidateIdentityReferences) {
    throw new Error('PhonePe cleanup post-audit is not clean; rerun is safe and required.');
  }
  return { alreadyClean: false, before, after, backup, deletedByCollection };
}

module.exports = {
  BACKUP_SCHEMA_VERSION,
  assertSafetyGate,
  buildCleanupPlan,
  createVerifiedBackup,
  deleteBackedUpPlan,
  executePhonePeCleanup,
  resolveCandidateIds,
};
