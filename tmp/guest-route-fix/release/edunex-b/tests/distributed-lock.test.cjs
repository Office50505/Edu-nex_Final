const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const {
  acquireDistributedLock,
  distributedLockKey,
  releaseDistributedLock,
  renewDistributedLock,
  runWithDistributedLock,
} = require('../services/distributedLock');

function fakeRedis() {
  const values = new Map();
  function current(key) {
    const entry = values.get(key);
    if (entry && entry.expiresAt <= Date.now()) {
      values.delete(key);
      return null;
    }
    return entry || null;
  }
  return {
    values,
    async set(key, value, options) {
      if (options?.NX && current(key)) return null;
      values.set(key, { value, expiresAt: Date.now() + options.PX });
      return 'OK';
    },
    async eval(script, { keys, arguments: args }) {
      const entry = current(keys[0]);
      if (!entry || entry.value !== args[0]) return 0;
      if (script.includes('PEXPIRE')) {
        entry.expiresAt = Date.now() + Number(args[1]);
        return 1;
      }
      values.delete(keys[0]);
      return 1;
    },
  };
}

function quietLogger() {
  const messages = [];
  return {
    messages,
    log(message) { messages.push(String(message)); },
    warn(message) { messages.push(String(message)); },
    error(message) { messages.push(String(message)); },
  };
}

const productionEnv = { NODE_ENV: 'production', REDIS_URL: 'rediss://configured' };

test('Phase 5 distributed cron locks', async (t) => {
  await t.test('first owner acquires, a simultaneous owner is rejected, and tokens are unique', async () => {
    const client = fakeRedis();
    const first = await acquireDistributedLock('course-stats', 1000, { client, env: productionEnv });
    const second = await acquireDistributedLock('course-stats', 1000, { client, env: productionEnv });
    const other = await acquireDistributedLock('daily-analytics', 1000, { client, env: productionEnv });

    assert.equal(first.acquired, true);
    assert.equal(second.acquired, false);
    assert.equal(second.reason, 'held');
    assert.equal(other.acquired, true, 'separate cron jobs must not block each other');
    assert.notEqual(first.token, other.token);
    assert.equal(first.key, 'edunex:production:cron:course-stats');
    assert.equal(other.key, 'edunex:production:cron:daily-analytics');
  });

  await t.test('only the correct owner can atomically release or renew a lock', async () => {
    const client = fakeRedis();
    const lock = await acquireDistributedLock('dropoff', 1000, { client, env: productionEnv });
    assert.equal(await releaseDistributedLock({ ...lock, token: 'wrong-owner' }), false);
    assert.ok(client.values.has(lock.key));
    assert.equal(await renewDistributedLock({ ...lock, token: 'wrong-owner' }), false);
    assert.equal(await renewDistributedLock(lock), true);
    assert.equal(await releaseDistributedLock(lock), true);
    assert.equal(client.values.has(lock.key), false);
  });

  await t.test('locks expire automatically when an owner dies', async () => {
    const client = fakeRedis();
    const first = await acquireDistributedLock('subscription-expiry', 20, { client, env: productionEnv });
    assert.equal(first.acquired, true);
    await new Promise((resolve) => setTimeout(resolve, 35));
    const replacement = await acquireDistributedLock('subscription-expiry', 20, { client, env: productionEnv });
    assert.equal(replacement.acquired, true);
    assert.notEqual(replacement.token, first.token);
  });

  await t.test('production Redis failure skips the job without exposing connection secrets', async () => {
    const secret = 'do-not-log-this';
    const client = {
      async set() { throw new Error(`rediss://user:${secret}@cache.example`); },
    };
    const logger = quietLogger();
    let executions = 0;
    const result = await runWithDistributedLock({
      jobName: 'subscription-expiry',
      lockTtlMs: 1000,
      task: async () => { executions += 1; },
      logger,
      env: productionEnv,
      client,
    });

    assert.equal(result.executed, false);
    assert.equal(result.reason, 'unavailable');
    assert.equal(executions, 0);
    assert.match(logger.messages.join(' '), /cron skipped because distributed lock unavailable/);
    assert.ok(!logger.messages.join(' ').includes(secret));
    assert.ok(!logger.messages.join(' ').includes('rediss://'));
  });

  await t.test('a thrown job still releases its lock in finally', async () => {
    const client = fakeRedis();
    const logger = quietLogger();
    await assert.rejects(
      runWithDistributedLock({
        jobName: 'course-stats',
        lockTtlMs: 1000,
        task: async () => { throw new Error('job failed'); },
        logger,
        env: productionEnv,
        client,
      }),
      /job failed/
    );
    const next = await acquireDistributedLock('course-stats', 1000, { client, env: productionEnv });
    assert.equal(next.acquired, true);
  });

  await t.test('simulated concurrent subscription schedulers execute expiry only once', async () => {
    const client = fakeRedis();
    const logger = quietLogger();
    let executions = 0;
    let signalStarted;
    let allowFinish;
    const started = new Promise((resolve) => { signalStarted = resolve; });
    const finish = new Promise((resolve) => { allowFinish = resolve; });
    const task = async () => {
      executions += 1;
      signalStarted();
      await finish;
    };

    const first = runWithDistributedLock({
      jobName: 'subscription-expiry', lockTtlMs: 1000, task, logger, env: productionEnv, client,
    });
    await started;
    const second = await runWithDistributedLock({
      jobName: 'subscription-expiry', lockTtlMs: 1000, task, logger, env: productionEnv, client,
    });
    assert.equal(second.executed, false);
    assert.equal(second.reason, 'held');
    assert.equal(executions, 1);
    allowFinish();
    assert.equal((await first).executed, true);
  });

  await t.test('all four schedules use separate documented locks and TTLs', () => {
    const registrations = [];
    const originalLoad = Module._load;
    const courseJobPath = require.resolve('../jobs/courseStatsJob');
    const subscriptionJobPath = require.resolve('../jobs/subscriptionTasks');
    Module._load = function load(request, parent, isMain) {
      if (request === '../services/distributedLock' && parent?.filename?.includes(`${path.sep}jobs${path.sep}`)) {
        return { scheduleLockedJob(options) { registrations.push(options); } };
      }
      if (request === 'node-cron' && parent?.filename?.includes(`${path.sep}jobs${path.sep}`)) return {};
      if (request.startsWith('../models/') && parent?.filename?.includes(`${path.sep}jobs${path.sep}`)) return {};
      return originalLoad.call(this, request, parent, isMain);
    };
    try {
      delete require.cache[courseJobPath];
      delete require.cache[subscriptionJobPath];
      require(courseJobPath);
      require(subscriptionJobPath);
    } finally {
      Module._load = originalLoad;
      delete require.cache[courseJobPath];
      delete require.cache[subscriptionJobPath];
    }

    assert.deepEqual(
      registrations.map(({ expression, jobName, lockTtlMs }) => ({ expression, jobName, lockTtlMs })),
      [
        { expression: '0 2 * * *', jobName: 'course-stats', lockTtlMs: 45 * 60 * 1000 },
        { expression: '0 1 * * *', jobName: 'daily-analytics', lockTtlMs: 90 * 60 * 1000 },
        { expression: '0 3 * * *', jobName: 'dropoff', lockTtlMs: 30 * 60 * 1000 },
        { expression: '*/30 * * * *', jobName: 'subscription-expiry', lockTtlMs: 15 * 60 * 1000 },
      ]
    );
    assert.equal(new Set(registrations.map(({ jobName }) => distributedLockKey(jobName, productionEnv))).size, 4);
  });

  await t.test('DISABLE_BACKGROUND_JOBS still guards scheduler startup', () => {
    const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    const guard = source.slice(
      source.indexOf("if (process.env.DISABLE_BACKGROUND_JOBS !== 'true')"),
      source.indexOf("}).catch((err)", source.indexOf("if (process.env.DISABLE_BACKGROUND_JOBS !== 'true')"))
    );
    assert.match(guard, /require\('\.\/jobs\/courseStatsJob'\)/);
    assert.match(guard, /require\('\.\/jobs\/subscriptionTasks'\)/);
  });
});
