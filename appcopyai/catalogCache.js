const CATALOG_CACHE_VERSION = 2;
const CATALOG_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ALL_COURSES_CACHE_KEY = `skillomate.catalog.all.v${CATALOG_CACHE_VERSION}`;
const TOP_COURSES_CACHE_KEY = `skillomate.catalog.top.v${CATALOG_CACHE_VERSION}`;

const memoryCache = new Map();
const inFlightRequests = new Map();

function compactCategory(category) {
  if (!category || typeof category !== 'object') return category || null;
  return {
    _id: category._id || category.id || null,
    name: category.name || '',
    slug: category.slug || '',
  };
}

function compactVideo(video) {
  if (!video || typeof video !== 'object') return null;
  return {
    _id: video._id || video.id || null,
    title: video.title || '',
    topic: video.topic || null,
    notes: video.notes || '',
    order: video.order ?? null,
    duration: video.duration ?? null,
    thumbnailUrl: video.thumbnailUrl || null,
    thumbnailVerticalUrl: video.thumbnailVerticalUrl || null,
  };
}

function compactCourse(course, includeVideos) {
  if (!course || typeof course !== 'object' || !course._id) return null;
  const compact = {
    _id: course._id,
    title: course.title || '',
    slug: course.slug || '',
    description: course.description || '',
    category: compactCategory(course.category),
    thumbnailUrl: course.thumbnailUrl || null,
    thumbnailVerticalUrl: course.thumbnailVerticalUrl || null,
    lessonCount: Number(course.lessonCount ?? course.videoCount ?? course.videos?.length ?? 0),
    videoCount: Number(course.videoCount ?? course.lessonCount ?? course.videos?.length ?? 0),
    averageRating: Number(course.averageRating || 0),
    totalWishlisted: Number(course.totalWishlisted || 0),
    totalStarted: Number(course.totalStarted || 0),
    totalCompleted: Number(course.totalCompleted || 0),
    completionRate: Number(course.completionRate || 0),
    studentCount: Number(course.studentCount || 0),
    publishedAt: course.publishedAt || null,
    createdAt: course.createdAt || null,
  };
  if (includeVideos && Array.isArray(course.videos)) {
    compact.videos = course.videos.map(compactVideo).filter(Boolean);
  }
  return compact;
}

function compactCourses(cacheKey, courses) {
  const includeVideos = cacheKey === TOP_COURSES_CACHE_KEY;
  return (Array.isArray(courses) ? courses : [])
    .map(course => compactCourse(course, includeVideos))
    .filter(Boolean);
}

function validEnvelope(value, now = Date.now()) {
  if (!value || value.version !== CATALOG_CACHE_VERSION || !Array.isArray(value.courses)) return null;
  const savedAt = Number(value.savedAt || 0);
  if (!savedAt || now - savedAt > CATALOG_CACHE_MAX_AGE_MS) return null;
  return { version: CATALOG_CACHE_VERSION, savedAt, courses: value.courses };
}

function peekCatalogCache(cacheKey, now = Date.now()) {
  const cached = validEnvelope(memoryCache.get(cacheKey), now);
  if (!cached) memoryCache.delete(cacheKey);
  return cached;
}

async function readCatalogCache(storage, cacheKey, now = Date.now()) {
  const memoryValue = peekCatalogCache(cacheKey, now);
  if (memoryValue) return memoryValue;
  try {
    const stored = validEnvelope(JSON.parse(await storage.getItem(cacheKey) || 'null'), now);
    if (!stored) {
      await storage.removeItem(cacheKey).catch(() => {});
      return null;
    }
    memoryCache.set(cacheKey, stored);
    return stored;
  } catch (_) {
    return null;
  }
}

async function writeCatalogCache(storage, cacheKey, courses, now = Date.now()) {
  const envelope = {
    version: CATALOG_CACHE_VERSION,
    savedAt: now,
    courses: compactCourses(cacheKey, courses),
  };
  memoryCache.set(cacheKey, envelope);
  await storage.setItem(cacheKey, JSON.stringify(envelope)).catch(() => {});
  return envelope;
}

function requestCatalogOnce(cacheKey, loader) {
  const pending = inFlightRequests.get(cacheKey);
  if (pending) return pending;
  const request = Promise.resolve()
    .then(loader)
    .finally(() => {
      if (inFlightRequests.get(cacheKey) === request) inFlightRequests.delete(cacheKey);
    });
  inFlightRequests.set(cacheKey, request);
  return request;
}

function resetCatalogCacheForTests() {
  memoryCache.clear();
  inFlightRequests.clear();
}

module.exports = {
  ALL_COURSES_CACHE_KEY,
  CATALOG_CACHE_MAX_AGE_MS,
  CATALOG_CACHE_VERSION,
  TOP_COURSES_CACHE_KEY,
  peekCatalogCache,
  readCatalogCache,
  requestCatalogOnce,
  resetCatalogCacheForTests,
  writeCatalogCache,
};
