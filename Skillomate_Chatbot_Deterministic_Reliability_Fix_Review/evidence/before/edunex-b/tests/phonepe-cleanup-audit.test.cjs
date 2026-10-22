const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const mongoose = require('mongoose');
const { auditPhonePeCleanup } = require('../services/phonePeCleanupAudit');
const { buildCleanupPlan, createVerifiedBackup, deleteBackedUpPlan } = require('../services/phonePeCleanup');

function valueAt(record, path) {
  return path.split('.').reduce((value, key) => value?.[key], record);
}

function matchesValue(value, condition) {
  if (condition instanceof RegExp) return condition.test(String(value || ''));
  if (!condition || typeof condition !== 'object' || condition instanceof mongoose.Types.ObjectId) {
    return String(value) === String(condition);
  }
  if ('$in' in condition && !condition.$in.some((item) => String(item) === String(value))) return false;
  if ('$nin' in condition && condition.$nin.some((item) => String(item) === String(value))) return false;
  if ('$exists' in condition && condition.$exists !== (value !== undefined)) return false;
  if ('$ne' in condition && String(value) === String(condition.$ne)) return false;
  if ('$not' in condition && matchesValue(value, condition.$not)) return false;
  return true;
}

function matches(record, query) {
  if (query.$or && !query.$or.some((entry) => matches(record, entry))) return false;
  return Object.entries(query).every(([path, condition]) => path === '$or' || matchesValue(valueAt(record, path), condition));
}

function fakeDb(seed) {
  const writes = [];
  return {
    writes,
    collection(name) {
      const records = seed[name] || [];
      return {
        find(query) {
          return {
            toArray: async () => records.filter((record) => matches(record, query)).map((record) => ({ ...record })),
          };
        },
        countDocuments: async (query) => records.filter((record) => matches(record, query)).length,
        async deleteMany(query) {
          const before = records.length;
          const retained = records.filter((record) => !matches(record, query));
          records.splice(0, records.length, ...retained);
          writes.push(['deleteMany', name]);
          return { deletedCount: before - records.length };
        },
        updateMany() { writes.push(['updateMany', name]); },
      };
    },
    listCollections() {
      return { toArray: async () => Object.keys(seed).map((name) => ({ name })) };
    },
  };
}

test('PhonePe cleanup dry run is read-only, repeatable, and counts orphaned references', async () => {
  const userId = new mongoose.Types.ObjectId();
  const orphanId = new mongoose.Types.ObjectId();
  const subscriptionId = new mongoose.Types.ObjectId();
  const seed = {
    users: [{ _id: userId, email: 'fixture@example.test', mobileNumber: '+910000000000', purchasedCourses: [], courseEntitlements: [] }],
    orders: [
      { _id: new mongoose.Types.ObjectId(), user: userId, subscription: subscriptionId, gateway: 'phonepe', status: 'paid' },
      { _id: new mongoose.Types.ObjectId(), user: orphanId, gateway: 'phonepe', status: 'pending' },
      { _id: new mongoose.Types.ObjectId(), user: userId, gateway: 'simulated', status: 'paid' },
    ],
    subscriptions: [{ _id: subscriptionId, user: userId, phonePeMerchantId: 'legacy', status: 'subscribed' }],
    subscriptionevents: [{ _id: new mongoose.Types.ObjectId(), user: userId, subscription: subscriptionId, event: 'PAYMENT_SUCCESS' }],
    sessions: [{ _id: new mongoose.Types.ObjectId(), user: userId }],
    analytics: [{ _id: new mongoose.Types.ObjectId(), userId: String(userId) }],
    otp_sessions: [{ _id: new mongoose.Types.ObjectId(), mobile: '+910000000000' }],
    razorpaybillings: [],
  };
  const db = fakeDb(seed);

  const first = await auditPhonePeCleanup(db);
  const second = await auditPhonePeCleanup(db);

  assert.deepEqual(second, first);
  assert.equal(first.users, 1);
  assert.equal(first.candidateIdentityReferences, 2);
  assert.equal(first.orphanedIdentityReferences, 1);
  assert.equal(first.orders, 3);
  assert.equal(first.subscriptions, 1);
  assert.equal(first.subscriptionEvents, 1);
  assert.equal(first.otherRecords, 3);
  assert.equal(first.safeToDelete, true);
  assert.deepEqual(db.writes, []);
});

test('PhonePe cleanup safety gate stops a candidate with production Razorpay billing', async () => {
  const userId = new mongoose.Types.ObjectId();
  const seed = {
    users: [{ _id: userId, purchasedCourses: [], courseEntitlements: [] }],
    orders: [{ _id: new mongoose.Types.ObjectId(), user: userId, gateway: 'phonepe', status: 'paid' }],
    subscriptions: [],
    subscriptionevents: [],
    razorpaybillings: [{ _id: userId, mode: 'live' }],
  };

  const result = await auditPhonePeCleanup(fakeDb(seed));

  assert.equal(result.safeToDelete, false);
  assert.equal(result.safetyConflicts.users, 1);
  assert.equal(result.safetyConflicts.razorpayProductionBilling, 1);
});

test('backed-up exact-record cleanup is verified and safe to rerun', async () => {
  const userId = new mongoose.Types.ObjectId();
  const subscriptionId = new mongoose.Types.ObjectId();
  const seed = {
    users: [{ _id: userId, email: 'fixture@example.test', mobileNumber: '+910000000000', purchasedCourses: [], courseEntitlements: [] }],
    orders: [{ _id: new mongoose.Types.ObjectId(), user: userId, subscription: subscriptionId, gateway: 'phonepe', status: 'pending' }],
    subscriptions: [{ _id: subscriptionId, user: userId, phonePeMerchantId: 'legacy', status: 'subscribed' }],
    subscriptionevents: [{ _id: new mongoose.Types.ObjectId(), user: userId, subscription: subscriptionId, event: 'PAYMENT_SUCCESS' }],
    sessions: [{ _id: new mongoose.Types.ObjectId(), user: userId }],
    razorpaybillings: [],
  };
  const db = fakeDb(seed);
  const plan = await buildCleanupPlan(db);
  const backupParent = fs.mkdtempSync(path.join(os.tmpdir(), 'phonepe-cleanup-test-'));
  try {
    const backup = createVerifiedBackup(plan, { parentDirectory: backupParent, repositoryRoot: process.cwd() });
    assert.equal(backup.verified, true);
    assert.equal(backup.totalRecords, 5);
    assert.equal(fs.statSync(backup.backupPath).mode & 0o777, 0o600);

    const first = await deleteBackedUpPlan(db, plan, null);
    const second = await deleteBackedUpPlan(db, plan, null);
    assert.equal(Object.values(first).reduce((sum, value) => sum + value, 0), 5);
    assert.equal(Object.values(second).reduce((sum, value) => sum + value, 0), 0);
    const after = await auditPhonePeCleanup(db);
    assert.equal(after.candidateIdentityReferences, 0);
    assert.equal(after.users, 0);
  } finally {
    fs.rmSync(backupParent, { recursive: true, force: true });
  }
});
