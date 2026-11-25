const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mobileRoot = path.join(__dirname, '..', '..', 'appcopyai');
const {
  ALL_COURSES_CACHE_KEY,
  CATALOG_CACHE_MAX_AGE_MS,
  TOP_COURSES_CACHE_KEY,
  peekCatalogCache,
  readCatalogCache,
  requestCatalogOnce,
  resetCatalogCacheForTests,
  writeCatalogCache,
} = require(path.join(mobileRoot, 'catalogCache.js'));

function storageHarness() {
  const values = new Map();
  return {
    values,
    storage: {
      getItem: async key => values.get(key) || null,
      setItem: async (key, value) => values.set(key, value),
      removeItem: async key => values.delete(key),
    },
  };
}

test.beforeEach(() => resetCatalogCacheForTests());

test('catalog cache is versioned, bounded, and stores only list fields', async () => {
  const { storage, values } = storageHarness();
  const now = Date.now();
  await writeCatalogCache(storage, ALL_COURSES_CACHE_KEY, [{
    _id: 'course-1',
    title: 'Fast course',
    category: { _id: 'category-1', name: 'AI', internalFlag: 'remove-me' },
    thumbnailUrl: 'https://images.example/course.jpg',
    videos: [{ _id: 'lesson-1', title: 'Lesson', videoUrl: 'https://private.example/video.m3u8' }],
    privateField: 'remove-me',
  }], now);

  const saved = JSON.parse(values.get(ALL_COURSES_CACHE_KEY));
  assert.equal(saved.savedAt, now);
  assert.equal(saved.courses[0].privateField, undefined);
  assert.equal(saved.courses[0].videos, undefined);
  assert.equal(saved.courses[0].category.internalFlag, undefined);
  assert.equal((await readCatalogCache(storage, ALL_COURSES_CACHE_KEY, now + 1000)).courses[0].title, 'Fast course');
  assert.equal(peekCatalogCache(ALL_COURSES_CACHE_KEY, now + 1000).courses.length, 1);
});

test('top-course cache keeps lightweight lesson metadata but never playback URLs', async () => {
  const { storage } = storageHarness();
  await writeCatalogCache(storage, TOP_COURSES_CACHE_KEY, [{
    _id: 'course-1',
    title: 'Course',
    videos: [{ _id: 'lesson-1', title: 'Lesson', order: 1, videoUrl: 'https://private.example/video.m3u8' }],
  }]);
  const cached = await readCatalogCache(storage, TOP_COURSES_CACHE_KEY);
  assert.equal(cached.courses[0].videos[0].title, 'Lesson');
  assert.equal(cached.courses[0].videos[0].videoUrl, undefined);
});

test('expired catalog entries are removed and concurrent requests are deduplicated', async () => {
  const { storage, values } = storageHarness();
  const now = Date.now();
  await writeCatalogCache(storage, ALL_COURSES_CACHE_KEY, [{ _id: 'course-1', title: 'Old' }], now);
  resetCatalogCacheForTests();
  assert.equal(await readCatalogCache(storage, ALL_COURSES_CACHE_KEY, now + CATALOG_CACHE_MAX_AGE_MS + 1), null);
  assert.equal(values.has(ALL_COURSES_CACHE_KEY), false);

  let loads = 0;
  let release;
  const loader = () => {
    loads += 1;
    return new Promise(resolve => { release = resolve; });
  };
  const first = requestCatalogOnce(ALL_COURSES_CACHE_KEY, loader);
  const second = requestCatalogOnce(ALL_COURSES_CACHE_KEY, loader);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(loads, 1);
  release(['course']);
  assert.equal(await first, await second);
});

test('mobile catalogue uses a summary endpoint, native image cache, and prefetch', () => {
  const appSource = fs.readFileSync(path.join(mobileRoot, 'App.js'), 'utf8');
  assert.match(appSource, /\/api\/courses\?summary=1/);
  assert.match(appSource, /\/api\/courses\?summary=home/);
  assert.match(appSource, /cache: "force-cache"/);
  assert.match(appSource, /Image\.prefetch\(url\)/);
  assert.match(appSource, /fadeDuration=\{0\}/);
  assert.match(appSource, /const CourseThumbnailImage = React\.memo/);
  assert.match(appSource, /const RemoteThumbnailImage = React\.memo/);
  assert.doesNotMatch(appSource, /key=\{resolvedUrl\}/);
  assert.match(appSource, /function CourseListSkeleton/);
});

test('top-course API is shared-cache backed and uses a lightweight projection', () => {
  const routeSource = fs.readFileSync(path.join(__dirname, '..', 'routes', 'mobileCompat.js'), 'utf8');
  const serviceSource = fs.readFileSync(path.join(__dirname, '..', 'services', 'mobileCompatibilityService.js'), 'utf8');
  const topProjection = serviceSource.match(/const TOP_COURSE_FIELDS = '([^']+)'/)?.[1] || '';

  assert.match(routeSource, /courses:top:v2:/);
  assert.match(routeSource, /getJsonCache\(PUBLIC_READ_CACHE_NAMESPACE, cacheKey\)/);
  assert.match(routeSource, /setJsonCache\(PUBLIC_READ_CACHE_NAMESPACE, cacheKey, courses/);
  assert.match(topProjection, /videos\._id/);
  assert.doesNotMatch(topProjection, /videoUrl|embedUrl|transcriptUrl|examplePrompt/);
});
