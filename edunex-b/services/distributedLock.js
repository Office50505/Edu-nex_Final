const crypto = require('node:crypto');
const {
  getSharedRedisClient,
  isSharedRedisConfigured,
} = require('./cacheService');

const CACHE_PREFIX = process.env.CACHE_PREFIX || 'edunex';
const SAFE_JOB_NAME = /^[a-z0-9][a-z0-9-]*$/;
const RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end`;
const RENEW_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], ARGV[2])
else
  return 0
end`;

function environmentName(env = process.env) {
  const value = String(env.NODE_ENV || 'development').trim().toLowerCase();
  return /^[a-z0-9-]+$/.test(value) ? value : 'unknown';
}

function distributedLockKey(jobName, env = process.env) {
  if (!SAFE_JOB_NAME.test(jobName)) {
    throw new TypeError(`Invalid cron job name: ${jobName}`);
  }
  return `${CACHE_PREFIX}:${environmentName(env)}:cron:${jobName}`;
}

function validTtl(ttlMs) {
  return Number.isSafeInteger(ttlMs) && ttlMs > 0;
}

async function acquireDistributedLock(jobName, ttlMs, options = {}) {
  if (!validTtl(ttlMs)) throw new TypeError('Distributed lock TTL must be a positive integer');

  let client;
  try {
    client = Object.prototype.hasOwnProperty.call(options, 'client')
      ? options.client
      : await getSharedRedisClient();
  } catch {
    return { acquired: false, reason: 'unavailable' };
  }
  if (!client) return { acquired: false, reason: 'unavailable' };

  const key = distributedLockKey(jobName, options.env);
  const token = crypto.randomUUID();
  try {
    const result = await client.set(key, token, { NX: true, PX: ttlMs });
    if (result === null) return { acquired: false, reason: 'held', key };
    if (result !== 'OK') return { acquired: false, reason: 'unavailable', key };
    return { acquired: true, client, jobName, key, token, ttlMs };
  } catch {
    return { acquired: false, reason: 'unavailable', key };
  }
}

async function releaseDistributedLock(lock) {
  if (!lock?.acquired || !lock.client || !lock.key || !lock.token) return false;
  try {
    const result = await lock.client.eval(RELEASE_SCRIPT, {
      keys: [lock.key],
      arguments: [lock.token],
    });
    return Number(result) === 1;
  } catch {
    return false;
  }
}

async function renewDistributedLock(lock) {
  if (!lock?.acquired || !lock.client || !lock.key || !lock.token || !validTtl(lock.ttlMs)) return false;
  try {
    const result = await lock.client.eval(RENEW_SCRIPT, {
      keys: [lock.key],
      arguments: [lock.token, String(lock.ttlMs)],
    });
    return Number(result) === 1;
  } catch {
    return false;
  }
}

function safeLog(logger, method, message) {
  const log = logger?.[method];
  if (typeof log === 'function') log.call(logger, message);
}

async function runWithDistributedLock({
  jobName,
  lockTtlMs,
  task,
  logger = console,
  env = process.env,
  client,
  renewalIntervalMs,
}) {
  if (typeof task !== 'function') throw new TypeError('Distributed lock task must be a function');

  const clientProvided = Object.prototype.hasOwnProperty.call(arguments[0] || {}, 'client');
  const redisConfigured = clientProvided
    ? Boolean(client)
    : isSharedRedisConfigured();
  if (!redisConfigured && env.NODE_ENV !== 'production') {
    safeLog(logger, 'log', `[CRON] cron=${jobName} lock=acquired mode=development-without-redis`);
    await task();
    return { executed: true, mode: 'development-without-redis' };
  }

  const lockOptions = { env };
  if (clientProvided) lockOptions.client = client;
  const lock = await acquireDistributedLock(jobName, lockTtlMs, lockOptions);
  if (!lock.acquired) {
    if (lock.reason === 'held') {
      safeLog(logger, 'log', `[CRON] cron=${jobName} lock=skipped reason=held`);
    } else {
      safeLog(logger, 'warn', `[CRON] cron=${jobName} lock=skipped; cron skipped because distributed lock unavailable`);
    }
    return { executed: false, reason: lock.reason };
  }

  safeLog(logger, 'log', `[CRON] cron=${jobName} lock=acquired`);
  const heartbeatMs = renewalIntervalMs || Math.max(1000, Math.floor(lockTtlMs / 3));
  let heartbeatPromise = null;
  let heartbeatStopped = false;
  const heartbeat = setInterval(() => {
    if (heartbeatPromise || heartbeatStopped) return;
    heartbeatPromise = renewDistributedLock(lock)
      .then((renewed) => {
        if (!renewed && !heartbeatStopped) {
          heartbeatStopped = true;
          safeLog(logger, 'warn', `[CRON] cron=${jobName} lock=renewal-failed`);
        }
      })
      .finally(() => {
        heartbeatPromise = null;
      });
  }, heartbeatMs);
  heartbeat.unref?.();

  try {
    await task();
    return { executed: true };
  } finally {
    heartbeatStopped = true;
    clearInterval(heartbeat);
    if (heartbeatPromise) await heartbeatPromise;
    const released = await releaseDistributedLock(lock);
    if (!released) {
      safeLog(logger, 'warn', `[CRON] cron=${jobName} lock=release-failed; lock will expire automatically`);
    }
  }
}

function scheduleLockedJob({ cron, expression, jobName, lockTtlMs, task, logger = console }) {
  return cron.schedule(expression, async () => {
    try {
      await runWithDistributedLock({ jobName, lockTtlMs, task, logger });
    } catch (error) {
      logger.error(`[CRON] cron=${jobName} failed:`, error);
    }
  });
}

module.exports = {
  acquireDistributedLock,
  distributedLockKey,
  releaseDistributedLock,
  renewDistributedLock,
  runWithDistributedLock,
  scheduleLockedJob,
};
