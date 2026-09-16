const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);

function isTruthy(value) {
  return TRUE_VALUES.has(String(value || '').trim().toLowerCase());
}

function hasValue(value) {
  return String(value ?? '').trim() !== '';
}

function areRateLimitsDisabled() {
  if (hasValue(process.env.RATE_LIMITING_ENABLED)) {
    return !isTruthy(process.env.RATE_LIMITING_ENABLED);
  }

  return isTruthy(process.env.DISABLE_RATE_LIMITS)
    || isTruthy(process.env.DISABLE_ALL_RATE_LIMITS);
}

function isAuthRateLimitDisabled() {
  if (hasValue(process.env.RATE_LIMITING_ENABLED)) {
    return !isTruthy(process.env.RATE_LIMITING_ENABLED);
  }

  return areRateLimitsDisabled() || isTruthy(process.env.DISABLE_AUTH_RATE_LIMIT);
}

function canDisableRateLimitsInProduction() {
  return isTruthy(process.env.ALLOW_RATE_LIMIT_DISABLE_IN_PRODUCTION);
}

module.exports = {
  areRateLimitsDisabled,
  canDisableRateLimitsInProduction,
  isAuthRateLimitDisabled,
  isTruthy,
};
