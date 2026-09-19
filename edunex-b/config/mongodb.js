const DEFAULT_MONGODB_CONNECTION_OPTIONS = Object.freeze({
  maxPoolSize: 20,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000,
});

function parsePositiveInteger(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;

  const normalized = String(value).trim();
  if (!/^[1-9]\d*$/.test(normalized)) return fallback;

  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function getMongoConnectionOptions(env = process.env) {
  return {
    maxPoolSize: parsePositiveInteger(
      env.MONGODB_MAX_POOL_SIZE,
      DEFAULT_MONGODB_CONNECTION_OPTIONS.maxPoolSize
    ),
    minPoolSize: parsePositiveInteger(
      env.MONGODB_MIN_POOL_SIZE,
      DEFAULT_MONGODB_CONNECTION_OPTIONS.minPoolSize
    ),
    serverSelectionTimeoutMS: parsePositiveInteger(
      env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
      DEFAULT_MONGODB_CONNECTION_OPTIONS.serverSelectionTimeoutMS
    ),
    connectTimeoutMS: parsePositiveInteger(
      env.MONGODB_CONNECT_TIMEOUT_MS,
      DEFAULT_MONGODB_CONNECTION_OPTIONS.connectTimeoutMS
    ),
  };
}

module.exports = {
  DEFAULT_MONGODB_CONNECTION_OPTIONS,
  getMongoConnectionOptions,
  parsePositiveInteger,
};
