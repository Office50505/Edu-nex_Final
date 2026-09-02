const { createClient } = require('redis');

const REDIS_URL = process.env.REDIS_URL || '';
const CACHE_PREFIX = process.env.CACHE_PREFIX || 'edunex';

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

async function getRedisClient() {
  if (!REDIS_URL) return null;
  if (redisClient?.isOpen) return redisClient;

  if (!redisClient) {
    redisClient = createClient({ url: REDIS_URL });
    redisClient.on('error', (error) => {
      if (!redisUnavailableLogged) {
        console.warn(`Redis cache unavailable: ${error.message}`);
        redisUnavailableLogged = true;
      }
    });
  }

  if (!redisConnectPromise) {
    redisConnectPromise = redisClient.connect()
      .then(() => {
        redisUnavailableLogged = false;
        console.log('✅ Redis cache connected');
        return redisClient;
      })
      .catch((error) => {
        redisConnectPromise = null;
        if (!redisUnavailableLogged) {
          console.warn(`Redis cache unavailable: ${error.message}`);
          redisUnavailableLogged = true;
        }
        return null;
      });
  }

  return redisConnectPromise;
}

async function getJsonCache(namespace, key) {
  const client = await getRedisClient();
  if (!client) {
    return getMemoryJson(namespace, key);
  }

  try {
    const raw = await client.get(buildKey(namespace, key));
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    if (!redisUnavailableLogged) {
      console.warn(`Redis cache read failed: ${error.message}`);
      redisUnavailableLogged = true;
    }
    return getMemoryJson(namespace, key);
  }
}

async function setJsonCache(namespace, key, data, ttlSeconds) {
  const client = await getRedisClient();
  if (!client) {
    setMemoryJson(namespace, key, data, ttlSeconds);
    return;
  }

  try {
    await client.set(buildKey(namespace, key), JSON.stringify(data), { EX: ttlSeconds });
  } catch (error) {
    if (!redisUnavailableLogged) {
      console.warn(`Redis cache write failed: ${error.message}`);
      redisUnavailableLogged = true;
    }
    setMemoryJson(namespace, key, data, ttlSeconds);
  }
}

async function clearCacheNamespace(namespace) {
  clearMemoryNamespace(namespace);

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
  } catch (error) {
    if (!redisUnavailableLogged) {
      console.warn(`Redis cache clear failed: ${error.message}`);
      redisUnavailableLogged = true;
    }
  }
}

function getCacheBackend() {
  return REDIS_URL ? 'redis' : 'memory';
}

module.exports = {
  clearCacheNamespace,
  getCacheBackend,
  getJsonCache,
  setJsonCache,
};
