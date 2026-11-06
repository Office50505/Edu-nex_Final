const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { syncUserSubscriptionMirror } = require('../services/subscriptionMirror');
const subscriptionAccess = require('../services/subscriptionAccess');
const now = Date.parse('2026-10-09T12:00:00Z');
const future = new Date(now + 86400000);
const expired = new Date(now - 1000);

function harness({ subscription = null, apple = null, google = null, user = {}, beforeUpdate } = {}) {
  const state = { subscription, apple, google, user: { _id: 'learner', subscriptionStatus: 'active', subscriptionExpiry: future, isOnTrial: false, ...user }, writes: 0 };
  const equal = (left, right) => left instanceof Date || right instanceof Date ? +new Date(left) === +new Date(right) : (left ?? null) === (right ?? null);
  const models = {
    now,
    User: {
      findById: async () => state.user ? { ...state.user } : null,
      updateOne: async (filter, update) => {
        state.writes += 1;
        if (beforeUpdate) await beforeUpdate(state);
        if (!Object.entries(filter).every(([key, value]) => equal(state.user?.[key], value))) return { matchedCount: 0 };
        Object.assign(state.user, update.$set);
        return { matchedCount: 1 };
      },
    },
    Subscription: { findOne: async () => state.subscription },
    AppleSubscription: { findOne: async () => state.apple },
    GooglePlaySubscription: { findOne: async () => state.google },
  };
  return { state, models };
}

test('expired Google refresh preserves independently verified Apple and Razorpay access', async () => {
  for (const other of [
    { apple: { entitlementState: 'ACTIVE', expiresAt: future } },
    { subscription: { gateway: 'razorpay', status: 'active', currentPeriodEnd: future } },
  ]) {
    const h = harness({ ...other, google: { entitlementState: 'EXPIRED', expiresAt: expired } });
    await syncUserSubscriptionMirror('learner', h.models);
    assert.equal(h.state.user.subscriptionStatus, 'active');
    assert.equal(+h.state.user.subscriptionExpiry, +future);
  }
});

test('revoked Google with no independently paid period clears the stale mirror', async () => {
  const h = harness({ google: { entitlementState: 'REVOKED', expiresAt: future } });
  await syncUserSubscriptionMirror('learner', h.models);
  assert.equal(h.state.user.subscriptionStatus, 'expired');
  assert.equal(h.state.user.subscriptionExpiry, null);
  assert.equal(h.state.user.isOnTrial, false);
});

test('mirror retries a concurrent provider write using fresh provider records', async () => {
  const h = harness({ google: { entitlementState: 'EXPIRED', expiresAt: expired }, beforeUpdate(state) {
    if (state.writes !== 1) return;
    state.apple = { entitlementState: 'ACTIVE', expiresAt: new Date(+future + 86400000) };
    state.user.subscriptionExpiry = state.apple.expiresAt;
  } });
  const access = await syncUserSubscriptionMirror('learner', h.models);
  assert.equal(h.state.writes, 2);
  assert.equal(access.source, 'apple');
  assert.equal(+h.state.user.subscriptionExpiry, +future + 86400000);
});

test('persistent mirror contention is retryable and does not force a stale update', async () => {
  const h = harness({ google: { entitlementState: 'EXPIRED', expiresAt: expired }, beforeUpdate(state) {
    state.user.subscriptionExpiry = new Date(+state.user.subscriptionExpiry + 1000);
  } });
  await assert.rejects(syncUserSubscriptionMirror('learner', h.models), { code: 'SUBSCRIPTION_MIRROR_CONFLICT' });
  assert.equal(h.state.writes, 3);
  assert.equal(h.state.user.subscriptionStatus, 'active');
});

function middlewareHarness({ subscription = null, apple = null, google = null, user = {} } = {}) {
  const mod = { exports: {} };
  let trialCourseQueries = 0;
  vm.runInNewContext(fs.readFileSync(require.resolve('../middleware/checkSubscription'), 'utf8'), {
    module: mod, Date,
    require(name) {
      if (name.endsWith('/Subscription')) return { findOne: async () => subscription };
      if (name.endsWith('/AppleSubscription')) return { findOne: async () => apple };
      if (name.endsWith('/GooglePlaySubscription')) return { findOne: async () => google };
      if (name.endsWith('/subscriptionAccess')) return subscriptionAccess;
      if (name.endsWith('/courseAccess')) return { activeCourseEntitlement: () => null };
      if (name.endsWith('/Course')) return { findOne() { trialCourseQueries += 1; return { sort: () => ({ select: () => ({ lean: async () => ({ _id: 'primary' }) }) }) }; } };
      throw Error(`Unexpected dependency ${name}`);
    },
  });
  return { async call() {
    const req = { user: { _id: 'learner', ...user }, params: { id: 'other-course' } };
    const res = { code: 200, status(value) { this.code = value; return this; }, json(body) { this.body = body; return this; } };
    let allowed = false;
    await mod.exports.checkSubscription(req, res, () => { allowed = true; });
    return { req, res, allowed, trialCourseQueries };
  } };
}

test('course middleware accepts active store records even when legacy User mirror says expired', async () => {
  const expiresAt = new Date(Date.now() + 86400000);
  for (const store of [{ apple: { entitlementState: 'ACTIVE', expiresAt } }, { google: { entitlementState: 'ACTIVE', expiresAt } }]) {
    const result = await middlewareHarness({ ...store, user: { subscriptionStatus: 'expired' }, subscription: { status: 'trial', trialExpiresAt: expiresAt } }).call();
    assert.equal(result.allowed, true);
    assert.equal(result.trialCourseQueries, 0, 'store purchases must not inherit the Razorpay trial course restriction');
  }
});

test('course middleware denies pending/revoked Google despite an active User mirror', async () => {
  for (const entitlementState of ['BILLING_RETRY', 'REVOKED']) {
    const result = await middlewareHarness({ google: { entitlementState, expiresAt: new Date(Date.now() + 86400000) }, user: { subscriptionStatus: 'active' } }).call();
    assert.equal(result.allowed, false);
    assert.equal(result.res.code, 403);
  }
});

test('Razorpay trial course restrictions remain unchanged without active store access', async () => {
  const result = await middlewareHarness({ subscription: { gateway: 'razorpay', status: 'trial', trialExpiresAt: new Date(Date.now() + 86400000) } }).call();
  assert.equal(result.allowed, false);
  assert.equal(result.res.body.error, 'trial_course_locked');
  assert.equal(result.trialCourseQueries, 1);
});

function expiryJobHarness(h, { renewDuringScan = false, failMirror = false } = {}) {
  const events = [];
  const snapshot = { ...h.state.subscription };
  let task;
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../jobs/subscriptionTasks'), 'utf8'), {
    module: mod, Date, console: { log() {}, error() {} },
    require(name) {
      if (name === 'node-cron') return {};
      if (name.endsWith('/distributedLock')) return { scheduleLockedJob(options) { task = options.task; } };
      if (name.endsWith('/Subscription')) return {
        find: () => ({ select: async () => [snapshot] }),
        findOneAndUpdate: async (filter, update) => {
          if (renewDuringScan) { h.state.subscription.currentPeriodEnd = new Date(Date.now() + 86400000); h.state.subscription.status = 'active'; }
          if (h.state.subscription.status !== filter.status || +h.state.subscription.currentPeriodEnd !== +filter.currentPeriodEnd) return null;
          Object.assign(h.state.subscription, update.$set);
          return h.state.subscription;
        },
      };
      if (name.endsWith('/SubscriptionEvent')) return { insertMany: async rows => events.push(...rows) };
      if (name.endsWith('/subscriptionMirror')) return { syncUserSubscriptionMirror: async userId => {
        if (failMirror) throw Error('temporary persistence failure');
        return syncUserSubscriptionMirror(userId, h.models);
      } };
      throw Error(`Unexpected dependency ${name}`);
    },
  });
  return { run: () => task(), events };
}

test('legacy expiry worker preserves valid Google/Apple mirrors and only expires the scanned provider', async () => {
  for (const store of [{ apple: { entitlementState: 'ACTIVE', expiresAt: future } }, { google: { entitlementState: 'ACTIVE', expiresAt: future } }]) {
    const h = harness({ ...store, subscription: { _id: 'legacy', user: 'learner', status: 'active', currentPeriodEnd: expired } });
    const job = expiryJobHarness(h);
    await job.run();
    assert.equal(h.state.subscription.status, 'expired');
    assert.equal(h.state.user.subscriptionStatus, 'active');
    assert.equal(job.events.length, 1);
  }
});

test('legacy expiry worker cannot overwrite a renewal committed after its scan', async () => {
  const h = harness({ subscription: { _id: 'legacy', user: 'learner', status: 'active', currentPeriodEnd: expired } });
  const job = expiryJobHarness(h, { renewDuringScan: true });
  await job.run();
  assert.equal(h.state.subscription.status, 'active');
  assert.equal(h.state.user.subscriptionStatus, 'active');
  assert.equal(job.events.length, 0);
});

test('mirror failure leaves an overdue provider eligible for the next expiry run', async () => {
  const h = harness({ subscription: { _id: 'legacy', user: 'learner', status: 'active', currentPeriodEnd: expired } });
  const job = expiryJobHarness(h, { failMirror: true });
  await job.run();
  assert.equal(h.state.subscription.status, 'active');
  assert.equal(job.events.length, 0);
});
