const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const {
  DEFAULT_MONGODB_CONNECTION_OPTIONS,
  getMongoConnectionOptions,
} = require('../config/mongodb');
const { createReadinessHandler } = require('../services/readinessService');

const serverSource = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const cacheServicePath = require.resolve('../services/cacheService');

function fakeMongoose({ connected = true, pingError = null } = {}) {
  const calls = { ping: 0, writes: 0 };
  return {
    calls,
    connection: {
      readyState: connected ? 1 : 0,
      db: {
        admin() {
          return {
            async ping() {
              calls.ping += 1;
              if (pingError) throw pingError;
              return { ok: 1 };
            },
          };
        },
      },
    },
  };
}

function fakeRedis({ connected = true, pingError = null } = {}) {
  const calls = { ping: 0, writes: 0 };
  return {
    calls,
    client: {
      isReady: connected,
      async ping() {
        calls.ping += 1;
        if (pingError) throw pingError;
        return 'PONG';
      },
    },
  };
}

function responseRecorder() {
  return {
    body: undefined,
    statusCode: undefined,
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

async function runReadiness({ mongo, redis, getClient } = {}) {
  const mongoose = mongo || fakeMongoose();
  const redisState = redis || fakeRedis();
  const res = responseRecorder();
  const handler = createReadinessHandler({
    mongoose,
    getSharedRedisClient: getClient || (async () => redisState.client),
  });
  await handler({}, res);
  return { mongoose, redis: redisState, res };
}

test('Phase 8 ALB readiness endpoint and MongoDB pool', async (t) => {
  await t.test('MongoDB connected and Redis connected returns 200', async () => {
    const { res } = await runReadiness();
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      ok: true,
      service: 'Skillomate API',
      mongodb: 'connected',
      redis: 'connected',
    });
  });

  await t.test('MongoDB unavailable returns 503', async () => {
    const { res } = await runReadiness({ mongo: fakeMongoose({ connected: false }) });
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.mongodb, 'disconnected');
    assert.equal(res.body.redis, 'connected');
  });

  await t.test('Redis unavailable returns 503', async () => {
    const { res } = await runReadiness({ redis: fakeRedis({ connected: false }) });
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.mongodb, 'connected');
    assert.equal(res.body.redis, 'disconnected');
  });

  await t.test('both dependencies unavailable returns 503', async () => {
    const { res } = await runReadiness({
      mongo: fakeMongoose({ connected: false }),
      redis: fakeRedis({ connected: false }),
    });
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.mongodb, 'disconnected');
    assert.equal(res.body.redis, 'disconnected');
  });

  await t.test('/api/health behavior remains unchanged', () => {
    assert.match(serverSource, /app\.get\('\/api\/health', \(req, res\) => \{\s*res\.json\(\{\s*ok: true,\s*service: 'Skillomate API',\s*uptimeSeconds: Math\.round\(process\.uptime\(\)\),\s*cache: getCacheBackend\(\),\s*\}\);\s*\}\);/);
  });

  await t.test('readiness performs only ping reads and no writes', async () => {
    const result = await runReadiness();
    assert.equal(result.mongoose.calls.ping, 1);
    assert.equal(result.redis.calls.ping, 1);
    assert.equal(result.mongoose.calls.writes, 0);
    assert.equal(result.redis.calls.writes, 0);
    assert.doesNotMatch(serverSource.slice(
      serverSource.indexOf("app.get('/api/ready'"),
      serverSource.indexOf("app.get('/api/health/db'")
    ), /\.(?:set|del|save|create|update|insert|delete)\s*\(/);
  });

  await t.test('readiness reuses one Redis singleton across requests', async () => {
    const previousRedisUrl = process.env.REDIS_URL;
    const originalLoad = Module._load;
    let createCount = 0;
    let connectCount = 0;
    let pingCount = 0;
    const client = {
      isOpen: false,
      isReady: false,
      on() { return this; },
      async connect() {
        connectCount += 1;
        this.isOpen = true;
        this.isReady = true;
      },
      async ping() {
        pingCount += 1;
        return 'PONG';
      },
    };

    process.env.REDIS_URL = 'rediss://user:secret@cache.invalid';
    delete require.cache[cacheServicePath];
    Module._load = function load(request, parent, isMain) {
      if (request === 'redis' && parent?.filename === cacheServicePath) {
        return {
          createClient() {
            createCount += 1;
            return client;
          },
        };
      }
      return originalLoad.call(this, request, parent, isMain);
    };

    try {
      const { getSharedRedisClient } = require(cacheServicePath);
      const handler = createReadinessHandler({ mongoose: fakeMongoose(), getSharedRedisClient });
      await handler({}, responseRecorder());
      await handler({}, responseRecorder());
      assert.equal(createCount, 1);
      assert.equal(connectCount, 1);
      assert.equal(pingCount, 2);
    } finally {
      Module._load = originalLoad;
      delete require.cache[cacheServicePath];
      if (previousRedisUrl === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = previousRedisUrl;
    }
  });

  await t.test('MongoDB pool defaults and invalid values parse safely', () => {
    assert.deepEqual(getMongoConnectionOptions({}), DEFAULT_MONGODB_CONNECTION_OPTIONS);
    assert.deepEqual(getMongoConnectionOptions({
      MONGODB_MAX_POOL_SIZE: '0',
      MONGODB_MIN_POOL_SIZE: '-2',
      MONGODB_SERVER_SELECTION_TIMEOUT_MS: 'not-a-number',
      MONGODB_CONNECT_TIMEOUT_MS: '2.5',
    }), DEFAULT_MONGODB_CONNECTION_OPTIONS);
  });

  await t.test('environment overrides MongoDB pool values', () => {
    assert.deepEqual(getMongoConnectionOptions({
      MONGODB_MAX_POOL_SIZE: '40',
      MONGODB_MIN_POOL_SIZE: '4',
      MONGODB_SERVER_SELECTION_TIMEOUT_MS: '2500',
      MONGODB_CONNECT_TIMEOUT_MS: '8000',
    }), {
      maxPoolSize: 40,
      minPoolSize: 4,
      serverSelectionTimeoutMS: 2500,
      connectTimeoutMS: 8000,
    });
  });

  await t.test('dependency errors expose no connection secrets in responses or logs', async () => {
    const secret = 'super-secret-password';
    const messages = [];
    const originalError = console.error;
    const originalWarn = console.warn;
    console.error = (...args) => messages.push(args.join(' '));
    console.warn = (...args) => messages.push(args.join(' '));

    try {
      const { res } = await runReadiness({
        mongo: fakeMongoose({ pingError: new Error(`mongodb://user:${secret}@mongo.internal/db`) }),
        redis: fakeRedis({ pingError: new Error(`rediss://user:${secret}@cache.internal`) }),
      });
      const exposed = `${JSON.stringify(res.body)} ${messages.join(' ')}`;
      assert.equal(res.statusCode, 503);
      assert.ok(!exposed.includes(secret));
      assert.ok(!exposed.includes('mongo.internal'));
      assert.ok(!exposed.includes('cache.internal'));
    } finally {
      console.error = originalError;
      console.warn = originalWarn;
    }
  });
});
