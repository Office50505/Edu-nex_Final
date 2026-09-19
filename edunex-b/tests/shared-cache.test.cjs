const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');

const servicePath = require.resolve('../services/cacheService');
const serverSource = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');

function createFakeRedis({ connectError = null, getError = null, setError = null } = {}) {
  const store = new Map();
  const listeners = new Map();
  const calls = { connect: 0, del: [], get: [], set: [] };
  const client = {
    isOpen: false,
    isReady: false,
    on(event, handler) {
      listeners.set(event, handler);
      return this;
    },
    async connect() {
      calls.connect += 1;
      if (connectError) {
        this.isOpen = false;
        this.isReady = false;
        throw connectError;
      }
      this.isOpen = true;
      this.isReady = true;
      listeners.get('ready')?.();
      return this;
    },
    async get(key) {
      calls.get.push(key);
      if (getError) throw getError;
      return store.has(key) ? store.get(key) : null;
    },
    async set(key, value, options) {
      calls.set.push({ key, value, options });
      if (setError) throw setError;
      store.set(key, value);
    },
    async *scanIterator({ MATCH }) {
      const prefix = MATCH.slice(0, -1);
      for (const key of Array.from(store.keys())) {
        if (key.startsWith(prefix)) yield key;
      }
    },
    async del(keys) {
      const batch = Array.isArray(keys) ? keys : [keys];
      calls.del.push(batch);
      batch.forEach((key) => store.delete(key));
    },
  };
  return { calls, client, listeners, store };
}

async function withCacheService({ nodeEnv, redisUrl, prefix = 'skillomate:test', fake }, run) {
  const previousEnv = {
    CACHE_PREFIX: process.env.CACHE_PREFIX,
    NODE_ENV: process.env.NODE_ENV,
    REDIS_URL: process.env.REDIS_URL,
  };
  const originalLoad = Module._load;
  let createCount = 0;
  let createOptions;

  process.env.NODE_ENV = nodeEnv;
  process.env.CACHE_PREFIX = prefix;
  if (redisUrl === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = redisUrl;

  delete require.cache[servicePath];
  Module._load = function load(request, parent, isMain) {
    if (request === 'redis' && parent?.filename === servicePath) {
      return {
        createClient(options) {
          createCount += 1;
          createOptions = options;
          return fake.client;
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  let service;
  try {
    service = require(servicePath);
  } finally {
    Module._load = originalLoad;
  }

  try {
    await run(service, {
      createCount: () => createCount,
      createOptions: () => createOptions,
    });
  } finally {
    delete require.cache[servicePath];
    for (const [name, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function loadPublicReadHandlers(service, sourceRows) {
  const handlers = {};
  let sourceReads = 0;
  function Category(body) {
    this.save = async () => ({ _id: 'new-category', ...body });
  }
  Category.find = () => ({
    sort() { return this; },
    async lean() {
      sourceReads += 1;
      return sourceRows.categories;
    },
  });

  const categoryRoute = serverSource.slice(
    serverSource.indexOf("app.get('/api/categories'"),
    serverSource.indexOf('// Recommendation Routes')
  );
  vm.runInNewContext(categoryRoute, {
    app: {
      get(_path, handler) { handlers.categories = handler; },
      post(_path, _guard, handler) { handlers.createCategory = handler; },
    },
    Category,
    protectAdmin() {},
    getCachedPublicRead: (key) => service.getJsonCache('public-read', key),
    setCachedPublicRead: (key, value) => service.setJsonCache('public-read', key, value, 60),
    clearPublicReadCache: () => service.clearCacheNamespace('public-read'),
    setPublicReadCacheHeaders(res, hit) {
      res.set('X-Public-Read-Cache', hit ? 'hit' : 'miss');
    },
  });

  const courseRoute = serverSource.slice(
    serverSource.indexOf("app.get('/api/courses',"),
    serverSource.indexOf("app.post('/api/courses',")
  );
  const courseQuery = {
    select() { return this; },
    populate() { return this; },
    sort() { return this; },
    limit() { return this; },
    async lean() {
      sourceReads += 1;
      return sourceRows.courses;
    },
  };
  vm.runInNewContext(courseRoute, {
    app: { get(_path, handler) { handlers.courses = handler; } },
    Course: { find: () => courseQuery },
    getCachedPublicRead: (key) => service.getJsonCache('public-read', key),
    setCachedPublicRead: (key, value) => service.setJsonCache('public-read', key, value, 60),
    setPublicReadCacheHeaders(res, hit) {
      res.set('X-Public-Read-Cache', hit ? 'hit' : 'miss');
    },
    publicCourseThumbnailUrl: () => null,
    localThumbnailFileExists: () => false,
    isLocalThumbnailUrl: () => false,
  });

  return { handlers, sourceReads: () => sourceReads };
}

function responseRecorder() {
  return {
    body: undefined,
    headers: {},
    statusCode: 200,
    json(value) { this.body = value; return this; },
    set(name, value) { this.headers[name] = value; return this; },
    status(value) { this.statusCode = value; return this; },
  };
}

test('Phase 3 shared cache policy', async (t) => {
  await t.test('configured Redis stores both shared namespaces with existing TTLs and reports real state', async () => {
    const fake = createFakeRedis();
    await withCacheService({
      nodeEnv: 'production',
      redisUrl: 'rediss://cache-user:private-password@cache.example:6379',
      fake,
    }, async (service, inspection) => {
      assert.equal(service.getCacheBackend(), 'redis-disconnected');
      await service.setJsonCache('public-read', 'categories', [{ name: 'Design' }], 60);
      await service.setJsonCache('checkout-summary', 'course:v3:abc', { title: 'Course' }, 600);

      assert.equal(inspection.createCount(), 1, 'one Redis client is reused per process');
      assert.equal(inspection.createOptions().url, 'rediss://cache-user:private-password@cache.example:6379');
      assert.equal(inspection.createOptions().socket.connectTimeout, 2000);
      assert.equal(inspection.createOptions().socket.reconnectStrategy(0), 200);
      assert.equal(inspection.createOptions().socket.reconnectStrategy(3), false);
      assert.equal(service.getCacheBackend(), 'redis-connected');
      assert.deepEqual(await service.getJsonCache('public-read', 'categories'), [{ name: 'Design' }]);
      assert.deepEqual(await service.getJsonCache('checkout-summary', 'course:v3:abc'), { title: 'Course' });
      assert.deepEqual(fake.calls.set.map(({ key, options }) => [key, options.EX]), [
        ['skillomate:test:public-read:categories', 60],
        ['skillomate:test:checkout-summary:course:v3:abc', 600],
      ]);
    });
  });

  await t.test('Redis hit avoids the authoritative source and a miss populates Redis', async () => {
    const fake = createFakeRedis();
    await withCacheService({ nodeEnv: 'production', redisUrl: 'rediss://cache.example:6379', fake }, async (service) => {
      const rows = {
        categories: [{ _id: 'category-1', name: 'Marketing' }],
        courses: [{ _id: 'course-1', title: 'Growth', videos: [] }],
      };
      const { handlers, sourceReads } = loadPublicReadHandlers(service, rows);

      const miss = responseRecorder();
      await handlers.categories({}, miss);
      assert.equal(miss.headers['X-Public-Read-Cache'], 'miss');
      assert.equal(miss.body[0].name, 'Marketing');
      assert.equal(sourceReads(), 1);

      const hit = responseRecorder();
      await handlers.categories({}, hit);
      assert.equal(hit.headers['X-Public-Read-Cache'], 'hit');
      assert.equal(hit.body[0].name, 'Marketing');
      assert.equal(sourceReads(), 1, 'the Redis hit must not query MongoDB again');
    });
  });

  await t.test('production Redis outage is a miss, never a process-local replacement, and APIs use source data', async () => {
    const secret = 'do-not-log-this-password';
    const connectError = Object.assign(new Error(`failed rediss://user:${secret}@cache.example`), { code: 'ECONNREFUSED' });
    const fake = createFakeRedis({ connectError });
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (message) => warnings.push(String(message));
    try {
      await withCacheService({
        nodeEnv: 'production',
        redisUrl: `rediss://user:${secret}@cache.example:6379`,
        fake,
      }, async (service) => {
        const rows = {
          categories: [{ _id: 'category-1', name: 'Source category' }],
          courses: [{ _id: 'course-1', title: 'Source course', videos: [] }],
        };
        const { handlers, sourceReads } = loadPublicReadHandlers(service, rows);

        await service.setJsonCache('public-read', 'manual', { unsafe: true }, 60);
        assert.equal(await service.getJsonCache('public-read', 'manual'), null);
        assert.equal(service.getCacheBackend(), 'redis-disconnected');

        const firstCategory = responseRecorder();
        const secondCategory = responseRecorder();
        const course = responseRecorder();
        await handlers.categories({}, firstCategory);
        await handlers.categories({}, secondCategory);
        await handlers.courses({}, course);

        assert.equal(firstCategory.statusCode, 200);
        assert.equal(firstCategory.body[0].name, 'Source category');
        assert.equal(secondCategory.headers['X-Public-Read-Cache'], 'miss');
        assert.equal(course.statusCode, 200);
        assert.equal(course.body[0].title, 'Source course');
        assert.equal(sourceReads(), 3, 'each outage request must use MongoDB/source instead of local cache');
      });
    } finally {
      console.warn = originalWarn;
    }

    assert.equal(warnings.length, 1, 'repeat failures are rate-limited');
    assert.ok(!warnings.join(' ').includes(secret));
    assert.ok(!warnings.join(' ').includes('rediss://'));
  });

  await t.test('namespace invalidation deletes shared category, recommendation, course, and featured keys', async () => {
    const fake = createFakeRedis();
    await withCacheService({ nodeEnv: 'production', redisUrl: 'rediss://cache.example:6379', fake }, async (service) => {
      const entries = [
        ['public-read', 'categories'],
        ['public-read', 'recommendations:anonymous:4'],
        ['public-read', 'courses:published:list:v11'],
        ['checkout-summary', 'featured:v3'],
        ['checkout-summary', 'course:v3:abc'],
      ];
      for (const [namespace, key] of entries) {
        await service.setJsonCache(namespace, key, { cached: true }, 60);
      }

      await service.clearCacheNamespace('public-read');
      await service.clearCacheNamespace('checkout-summary');

      for (const [namespace, key] of entries) {
        assert.equal(await service.getJsonCache(namespace, key), null);
      }
      assert.ok(fake.calls.del.flat().some((key) => key.includes(':public-read:')));
      assert.ok(fake.calls.del.flat().some((key) => key.includes(':checkout-summary:')));
    });
  });

  await t.test('development without REDIS_URL retains TTL memory cache', async () => {
    const fake = createFakeRedis();
    await withCacheService({ nodeEnv: 'development', redisUrl: undefined, fake }, async (service, inspection) => {
      await service.setJsonCache('public-read', 'categories', [{ name: 'Local' }], 60);
      assert.deepEqual(await service.getJsonCache('public-read', 'categories'), [{ name: 'Local' }]);
      assert.equal(service.getCacheBackend(), 'memory');
      assert.equal(inspection.createCount(), 0);
      await service.clearCacheNamespace('public-read');
      assert.equal(await service.getJsonCache('public-read', 'categories'), null);
    });
  });

  await t.test('production without REDIS_URL disables shared cache instead of using memory', async () => {
    const fake = createFakeRedis();
    await withCacheService({ nodeEnv: 'production', redisUrl: undefined, fake }, async (service, inspection) => {
      await service.setJsonCache('public-read', 'categories', [{ name: 'Unsafe' }], 60);
      assert.equal(await service.getJsonCache('public-read', 'categories'), null);
      assert.equal(service.getCacheBackend(), 'disabled/no-shared-cache');
      assert.equal(inspection.createCount(), 0);
    });
  });
});
