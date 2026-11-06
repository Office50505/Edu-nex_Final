const { areRateLimitsDisabled } = require('../services/rateLimitToggle');

const buckets = new Map();
let lastSweepAt = 0;

function requestIp(req) {
  return String(req.headers?.['x-forwarded-for'] || req.ip || 'unknown')
    .split(',')[0]
    .trim();
}

function sweepExpired(now) {
  if (now - lastSweepAt < 60_000) return;
  lastSweepAt = now;
  for (const [key, entry] of buckets.entries()) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}

function sensitiveRateLimit({ namespace, windowMs, max, key, message = 'Too many requests. Please try again shortly.' }) {
  if (!namespace || !Number.isFinite(windowMs) || windowMs <= 0 || !Number.isFinite(max) || max <= 0) {
    throw new Error('A valid namespace, windowMs and max are required for sensitive rate limiting');
  }

  return (req, res, next) => {
    if (areRateLimitsDisabled()) return next();

    const now = Date.now();
    sweepExpired(now);
    const identity = String(key?.(req) || req.compatAuth?.userId || requestIp(req));
    const bucketKey = `${namespace}:${identity}`;
    let entry = buckets.get(bucketKey);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
    }
    entry.count += 1;
    buckets.set(bucketKey, entry);

    if (entry.count > max) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: message, code: 'RATE_LIMITED' });
    }
    return next();
  };
}

function resetSensitiveRateLimitsForTests() {
  buckets.clear();
  lastSweepAt = 0;
}

module.exports = { resetSensitiveRateLimitsForTests, sensitiveRateLimit };
