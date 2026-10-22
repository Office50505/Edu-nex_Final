const { createClient } = require('redis');

const REDIS_URL = process.env.REDIS_URL || '';
const CACHE_PREFIX = process.env.CACHE_PREFIX || 'edunex';
const MEMORY_CACHE_ENABLED = !REDIS_URL && process.env.NODE_ENV !== 'production';
const REDIS_CONNECT_TIMEOUT_MS = 2000;
const REDIS_RECONNECT_MAX_RETRIES = 3;
const REDIS_RECONNECT_MAX_DELAY_MS = 2000;

const memoryNamespaces = new Map();
let redisClient = null;
let redisConnectPromise = null;
let redisUnavailableLogged = false;

function getMemoryNamespace(namespace) {
  if (!memoryNamespaces.has(namespace)) {
    memoryNamespaces.set(namespace, new Map());
  }

  return memoryNamespaces.get(namespace);
}

function buildKey(namespace, key) {
  return `${CACHE_PREFIX}:${namespace}:${key}`;
}

function getMemoryJson(namespace, key) {
  const cached = getMemoryNamespace(namespace).get(key);
  if (!cached || Date.now() > cached.expiresAt) {
    getMemoryNamespace(namespace).delete(key);
    return null;
  }

  return cached.data;
}

function setMemoryJson(namespace, key, data, ttlSeconds) {
  getMemoryNamespace(namespace).set(key, {
    data,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

function clearMemoryNamespace(namespace) {
  getMemoryNamespace(namespace).clear();
}

function logRedisUnavailable(operation, error) {
  if (redisUnavailableLogged) return;

  // Error messages can contain a connection URL or credentials, so log only a safe code.
  const safeCode = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)
    ? ` (${error.code})`
    : '';
  console.warn(`Redis cache ${operation} failed${safeCode}; continuing without cached data.`);
  redisUnavailableLogged = true;
}

function markRedisAvailable() {
  redisUnavailableLogged = false;
}

function reconnectStrategy(retries) {
  if (retries >= REDIS_RECONNECT_MAX_RETRIES) return false;
  return Math.min(200 * (2 ** retries), REDIS_RECONNECT_MAX_DELAY_MS);
}

function createRedisClient() {
  const client = createClient({
    url: REDIS_URL,
    socket: {
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      reconnectStrategy,
    },
  });

  client.on('error', (error) => logRedisUnavailable('connection', error));
  client.on('ready', markRedisAvailable);
  return client;
}

async function getRedisClient() {
  if (!REDIS_URL) return null;

  if (!redisClient) {
    redisClient = createRedisClient();
  }

  if (redisClient.isReady) return redisClient;
  if (redisConnectPromise) return redisConnectPromise;

  // An open, non-ready client is already reconnecting. Do not queue cache commands
  // behind it; let the request use MongoDB/source data immediately.
  if (redisClient.isOpen) return null;

  redisConnectPromise = redisClient.connect()
    .then(() => {
      markRedisAvailable();
      return redisClient;
    })
    .catch((error) => {
      logRedisUnavailable('connection', error);
      return null;
    })
    .finally(() => {
      redisConnectPromise = null;
    });

  return redisConnectPromise;
}

async function getJsonCache(namespace, key) {
  if (MEMORY_CACHE_ENABLED) {
    return getMemoryJson(namespace, key);
  }

  const client = await getRedisClient();
  if (!client) return null;

  try {
    const raw = await client.get(buildKey(namespace, key));
    markRedisAvailable();
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    logRedisUnavailable('read', error);
    return null;
  }
}

async function setJsonCache(namespace, key, data, ttlSeconds) {
  if (MEMORY_CACHE_ENABLED) {
    setMemoryJson(namespace, key, data, ttlSeconds);
    return;
  }

  const client = await getRedisClient();
  if (!client) return;

  try {
    await client.set(buildKey(namespace, key), JSON.stringify(data), { EX: ttlSeconds });
    markRedisAvailable();
  } catch (error) {
    logRedisUnavailable('write', error);
  }
}

async function clearCacheNamespace(namespace) {
  if (MEMORY_CACHE_ENABLED) {
    clearMemoryNamespace(namespace);
    return;
  }

  const client = await getRedisClient();
  if (!client) return;

  try {
    const keys = [];
    for await (const key of client.scanIterator({ MATCH: buildKey(namespace, '*'), COUNT: 100 })) {
      keys.push(key);
      if (keys.length >= 100) {
        await client.del(keys.splice(0, keys.length));
      }
    }

    if (keys.length) {
      await client.del(keys);
    }
    markRedisAvailable();
  } catch (error) {
    logRedisUnavailable('invalidation', error);
  }
}

function getCacheBackend() {
  if (MEMORY_CACHE_ENABLED) return 'memory';
  if (!REDIS_URL) return 'disabled/no-shared-cache';
  return redisClient?.isReady ? 'redis-connected' : 'redis-disconnected';
}

function isSharedRedisConfigured() {
  return Boolean(REDIS_URL);
}

module.exports = {
  clearCacheNamespace,
  getCacheBackend,
  getJsonCache,
  getSharedRedisClient: getRedisClient,
  isSharedRedisConfigured,
  setJsonCache,
};
