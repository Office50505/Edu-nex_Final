const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const initialNodeEnv = process.env.NODE_ENV;
require('dotenv').config({ path: path.join(__dirname, '.env') });
if (initialNodeEnv !== 'production') {
  require('dotenv').config({ path: path.join(__dirname, '.env.local'), override: true });
}

const app = express();
app.disable('x-powered-by');

const PORT = process.env.PORT || 3000;
const FRONTEND_SOURCE_DIR = process.env.FRONTEND_DIR
  ? path.resolve(process.env.FRONTEND_DIR)
  : path.join(__dirname, '..', 'edunex-f');
const FRONTEND_DIST_DIR = process.env.FRONTEND_DIST_DIR
  ? path.resolve(process.env.FRONTEND_DIST_DIR)
  : path.join(FRONTEND_SOURCE_DIR, 'dist');
const FRONTEND_DIR = fs.existsSync(path.join(FRONTEND_DIST_DIR, 'index.html'))
  ? FRONTEND_DIST_DIR
  : FRONTEND_SOURCE_DIR;
const isProduction = process.env.NODE_ENV === 'production';
const SERVE_FRONTEND = process.env.SERVE_FRONTEND !== 'false' && fs.existsSync(FRONTEND_DIR);
const MONGODB_URI = process.env.MONGODB_URI || (isProduction ? '' : 'mongodb://localhost:27017/edunex');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (isProduction ? '' : 'Sdbc@123');
const ADMIN_TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || (isProduction ? '' : 'edunex-development-admin-secret');
const ACCESS_TOKEN_SECRET = process.env.JWT_SECRET || (isProduction ? '' : 'edunex-development-access-secret');
const FRONTEND_ORIGINS = [process.env.FRONTEND_ORIGIN, process.env.FRONTEND_ORIGINS]
  .filter(Boolean)
  .join(',')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE || '';
const BUNNY_STORAGE_REGION = process.env.BUNNY_STORAGE_REGION || '';
const BUNNY_STORAGE_ACCESS_KEY = process.env.BUNNY_STORAGE_ACCESS_KEY || '';
const BUNNY_PULL_ZONE_URL = process.env.BUNNY_PULL_ZONE_URL
  || (process.env.BUNNY_STREAM_CDN_HOSTNAME ? `https://${process.env.BUNNY_STREAM_CDN_HOSTNAME}/` : '')
  || 'https://edunex.b-cdn.net/';
const BUNNY_STREAM_LIBRARY_ID = process.env.BUNNY_STREAM_LIBRARY_ID || '';
const BUNNY_STREAM_API_KEY = process.env.BUNNY_STREAM_API_KEY || '';
const OTP_PROVIDER = String(process.env.OTP_PROVIDER || '').trim().toLowerCase();
const PAYMENT_GATEWAY_MODE = String(process.env.PAYMENT_GATEWAY_MODE || '').trim().toLowerCase();
const IMAGE_PROXY_ALLOWED_HOSTS = String(process.env.IMAGE_PROXY_ALLOWED_HOSTS || '')
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);
const jsonParser = express.json({ limit: '15mb' });
const urlencodedParser = express.urlencoded({ extended: true });

mongoose.set('bufferCommands', false);

function requireProductionEnv(names) {
  if (!isProduction) return;

  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) {
    console.error(`Missing required production environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

requireProductionEnv([
  'MONGODB_URI',
  'ADMIN_PASSWORD',
  'ADMIN_TOKEN_SECRET',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_SIGNUP_SECRET',
]);

if (isProduction && process.env.AUTO_VERIFY_OTP === 'true') {
  console.error('AUTO_VERIFY_OTP must not be true in production.');
  process.exit(1);
}

if (isProduction && ['development', 'dev', 'demo', 'mock', 'temp', 'temporary'].includes(OTP_PROVIDER)) {
  console.error('OTP_PROVIDER must not be development/demo/temp/mock in production.');
  process.exit(1);
}

if (isProduction && ['simulated', 'simulation', 'mock', 'local'].includes(PAYMENT_GATEWAY_MODE)) {
  console.error('PAYMENT_GATEWAY_MODE must not be simulated/mock/local in production.');
  process.exit(1);
}

if (isProduction && process.env.DISABLE_AUTH_RATE_LIMIT === 'true') {
  console.error('DISABLE_AUTH_RATE_LIMIT must not be true in production.');
  process.exit(1);
}

// Import models
const User = require('./models/User');
const Category = require('./models/Category');
const Course = require('./models/Course');
const Subscription = require('./models/Subscription');
const Order = require('./models/Order');
const Progress = require('./models/Progress');
const CourseProgress = require('./models/CourseProgress');
const CourseAnalytics = require('./models/CourseAnalytics');
const AnalyticsEvent = require('./models/AnalyticsEvent');
const Lesson = require('./models/Lesson');
const Review = require('./models/Review');
const Wishlist = require('./models/Wishlist');
const SubscriptionEvent = require('./models/SubscriptionEvent');
const ContactEnquiry = require('./models/ContactEnquiry');
const AiTutorSession = require('./models/AiTutorSession');
const LessonNote = require('./models/LessonNote');
const Notification = require('./models/Notification');
const Session = require('./models/Session');
const Certificate = require('./models/Certificate');

// Import routes
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payment');
const sessionRoutes = require('./routes/sessions');
const contentRoutes = require('./routes/content');
const aiRoutes = require('./routes/ai');
const mobileCompatRoutes = require('./routes/mobileCompat');
const { protect } = require('./middleware/auth');
const {
  clearCacheNamespace,
  getCacheBackend,
  getJsonCache,
  setJsonCache,
} = require('./services/cacheService');

const CHECKOUT_SUMMARY_CACHE_TTL_MS = 10 * 60 * 1000;
const PUBLIC_READ_CACHE_TTL_MS = 60 * 1000;
const CHECKOUT_SUMMARY_CACHE_TTL_SECONDS = Math.ceil(CHECKOUT_SUMMARY_CACHE_TTL_MS / 1000);
const PUBLIC_READ_CACHE_TTL_SECONDS = Math.ceil(PUBLIC_READ_CACHE_TTL_MS / 1000);
const PUBLIC_READ_CACHE_NAMESPACE = 'public-read';
const CHECKOUT_SUMMARY_CACHE_NAMESPACE = 'checkout-summary';
const RECOMMENDATION_LIMIT_DEFAULT = 4;
const RECOMMENDATION_LIMIT_MAX = 12;

const cspConnectSources = [...new Set(["'self'", 'https:', 'wss:', ...FRONTEND_ORIGINS])];

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      mediaSrc: ["'self'", 'blob:', 'https:'],
      fontSrc: ["'self'", 'data:', 'https:'],
      connectSrc: cspConnectSources,
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: isProduction ? [] : null,
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: isProduction
    ? { maxAge: 15552000, includeSubDomains: true }
    : false,
  referrerPolicy: { policy: 'no-referrer' },
  xFrameOptions: { action: 'deny' },
}));

async function getCachedPublicRead(key) {
  return getJsonCache(PUBLIC_READ_CACHE_NAMESPACE, key);
}

async function setCachedPublicRead(key, data) {
  await setJsonCache(PUBLIC_READ_CACHE_NAMESPACE, key, data, PUBLIC_READ_CACHE_TTL_SECONDS);
}

async function getCachedCheckoutSummary(key) {
  return getJsonCache(CHECKOUT_SUMMARY_CACHE_NAMESPACE, key);
}

async function setCachedCheckoutSummary(key, data) {
  await setJsonCache(CHECKOUT_SUMMARY_CACHE_NAMESPACE, key, data, CHECKOUT_SUMMARY_CACHE_TTL_SECONDS);
}

function setPublicReadCacheHeaders(res, hit) {
  res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.set('X-Public-Read-Cache', hit ? 'hit' : 'miss');
  res.set('X-Cache-Backend', getCacheBackend());
}

function setCheckoutSummaryCacheHeaders(res, hit) {
  res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
  res.set('X-Checkout-Summary-Cache', hit ? 'hit' : 'miss');
  res.set('X-Cache-Backend', getCacheBackend());
}

async function clearCheckoutSummaryCache() {
  await clearCacheNamespace(CHECKOUT_SUMMARY_CACHE_NAMESPACE);
}

async function clearPublicReadCache() {
  await clearCacheNamespace(PUBLIC_READ_CACHE_NAMESPACE);
}

async function clearPublicCourseCaches() {
  await Promise.all([
    clearCheckoutSummaryCache(),
    clearPublicReadCache(),
  ]);
}

function clampRecommendationLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return RECOMMENDATION_LIMIT_DEFAULT;
  return Math.max(1, Math.min(RECOMMENDATION_LIMIT_MAX, parsed));
}

function idString(value) {
  if (!value) return '';
  return String(value._id || value);
}

function isValidObjectId(value) {
  return Boolean(value && mongoose.Types.ObjectId.isValid(value));
}

function addWeightedSignal(map, key, weight) {
  if (!key || !Number.isFinite(weight) || weight <= 0) return;
  map.set(key, (map.get(key) || 0) + weight);
}

function courseCategoryId(course) {
  return idString(course?.category);
}

function courseCategoryName(course) {
  if (typeof course?.category === 'string') return course.category;
  return course?.category?.name || 'Course';
}

function recencyBoost(dateValue, maxBoost = 8) {
  const time = new Date(dateValue || 0).getTime();
  if (!Number.isFinite(time) || time <= 0) return 0;

  const ageDays = Math.max(0, (Date.now() - time) / (24 * 60 * 60 * 1000));
  if (ageDays <= 14) return maxBoost;
  if (ageDays >= 180) return 0;
  return Math.round(maxBoost * (1 - ((ageDays - 14) / 166)));
}

function publicCourseScore(course) {
  const rating = Math.max(0, Math.min(5, Number(course.averageRating || 0)));
  const totalStarted = Math.max(0, Number(course.totalStarted || 0));
  const totalCompleted = Math.max(0, Number(course.totalCompleted || 0));
  const totalWishlisted = Math.max(0, Number(course.totalWishlisted || 0));
  const completionRate = Math.max(0, Math.min(100, Number(course.completionRate || 0)));

  return (
    rating * 8
    + Math.log1p(totalStarted) * 6
    + Math.log1p(totalCompleted) * 8
    + Math.log1p(totalWishlisted) * 7
    + completionRate * 0.12
    + recencyBoost(course.publishedAt || course.createdAt, 6)
  );
}

function recommendationReason(course, categoryWeights, personalized) {
  const category = courseCategoryName(course);
  const categoryId = courseCategoryId(course);
  const rating = Number(course.averageRating || 0);

  if (personalized && categoryWeights.has(categoryId)) {
    return `Because you showed interest in ${category}`;
  }

  if (Number(course.totalWishlisted || 0) > 0) {
    return 'Popular with learners saving courses';
  }

  if (rating >= 4.5) {
    return 'Highly rated by EduNex learners';
  }

  if (Number(course.totalStarted || 0) > 0) {
    return 'Trending in the current catalog';
  }

  return 'New from the EduNex catalog';
}

function rankRecommendationCandidates(candidates, signals, limit) {
  const categoryWeights = signals.categoryWeights || new Map();
  const personalized = categoryWeights.size > 0;

  const ranked = candidates
    .filter((course) => !signals.completedCourseIds.has(idString(course._id)))
    .map((course) => {
      const categoryWeight = categoryWeights.get(courseCategoryId(course)) || 0;
      const score = publicCourseScore(course) + Math.min(72, categoryWeight * 12);
      return {
        ...course,
        recommendation: {
          score: Math.round(score),
          reason: recommendationReason(course, categoryWeights, personalized),
          personalized,
        },
      };
    })
    .sort((left, right) => {
      const leftExcluded = signals.seenCourseIds.has(idString(left._id)) ? 1 : 0;
      const rightExcluded = signals.seenCourseIds.has(idString(right._id)) ? 1 : 0;
      if (leftExcluded !== rightExcluded) return leftExcluded - rightExcluded;
      return right.recommendation.score - left.recommendation.score;
    });

  return ranked.slice(0, limit);
}

async function findOptionalRecommendationUser(req) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return null;

    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);
    const user = await User.findById(decoded.userId)
      .select('+activeSessionId +activeSessions')
      .lean();

    if (!user || user.isActive === false) return null;

    const sessionId = decoded.sessionId;
    const activeSessions = Array.isArray(user.activeSessions) ? user.activeSessions.map(String) : [];
    let isActive = sessionId && (
      String(user.activeSessionId || '') === String(sessionId)
      || activeSessions.includes(String(sessionId))
    );

    if (!isActive && sessionId) {
      const session = await Session.findOne({
        user: decoded.userId,
        sessionId,
        loggedOutAt: null,
      }).select('_id').lean();
      isActive = Boolean(session);
    }

    return isActive ? user : null;
  } catch (_) {
    return null;
  }
}

async function loadRecommendationSignals(user) {
  const emptySignals = {
    categoryWeights: new Map(),
    seenCourseIds: new Set(),
    completedCourseIds: new Set(),
  };

  if (!user?._id) return emptySignals;

  const userId = String(user._id);
  const [wishlist, progressRows, courseProgressRows, reviewRows] = await Promise.all([
    Wishlist.findOne({ user: user._id }).select('courses').lean(),
    Progress.find({ user: user._id })
      .select('course watchedSeconds completed lastWatchedAt')
      .sort({ lastWatchedAt: -1 })
      .limit(200)
      .lean(),
    CourseProgress.find({ userId })
      .select('courseId progressPercent updatedAt')
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean(),
    Review.find({ user: user._id })
      .select('course rating')
      .limit(100)
      .lean(),
  ]);

  const signalIds = new Set();
  (wishlist?.courses || []).forEach((courseId) => {
    const id = idString(courseId);
    if (isValidObjectId(id)) signalIds.add(id);
  });
  progressRows.forEach((row) => {
    const id = idString(row.course);
    if (isValidObjectId(id)) signalIds.add(id);
  });
  courseProgressRows.forEach((row) => {
    const id = idString(row.courseId);
    if (isValidObjectId(id)) signalIds.add(id);
  });
  reviewRows.forEach((row) => {
    const id = idString(row.course);
    if (isValidObjectId(id)) signalIds.add(id);
  });

  const signalCourses = signalIds.size
    ? await Course.find({ _id: { $in: Array.from(signalIds) } }).select('category').lean()
    : [];
  const categoryByCourse = new Map(signalCourses.map((course) => [idString(course._id), courseCategoryId(course)]));
  const categoryWeights = new Map();
  const seenCourseIds = new Set();
  const completedCourseIds = new Set();

  (wishlist?.courses || []).forEach((courseId) => {
    const id = idString(courseId);
    seenCourseIds.add(id);
    addWeightedSignal(categoryWeights, categoryByCourse.get(id), 5);
  });

  progressRows.forEach((row) => {
    const id = idString(row.course);
    if (!id) return;

    seenCourseIds.add(id);
    if (row.completed) completedCourseIds.add(id);

    const watchedWeight = Math.min(6, Math.max(0, Number(row.watchedSeconds || 0)) / 600);
    addWeightedSignal(categoryWeights, categoryByCourse.get(id), 3 + watchedWeight + recencyBoost(row.lastWatchedAt, 3));
  });

  courseProgressRows.forEach((row) => {
    const id = idString(row.courseId);
    if (!id) return;

    seenCourseIds.add(id);
    const progressPercent = Math.max(0, Math.min(100, Number(row.progressPercent || 0)));
    if (progressPercent >= 95) completedCourseIds.add(id);
    addWeightedSignal(categoryWeights, categoryByCourse.get(id), 2 + (progressPercent / 20) + recencyBoost(row.updatedAt, 2));
  });

  reviewRows.forEach((row) => {
    const id = idString(row.course);
    if (!id) return;

    seenCourseIds.add(id);
    addWeightedSignal(categoryWeights, categoryByCourse.get(id), Number(row.rating || 0) >= 4 ? 4 : 1);
  });

  return { categoryWeights, seenCourseIds, completedCourseIds };
}

async function getPublishedRecommendationCandidates() {
  return Course.aggregate([
    { $match: { status: 'published' } },
    {
      $lookup: {
        from: 'categories',
        localField: 'category',
        foreignField: '_id',
        as: 'category',
      },
    },
    { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        title: 1,
        slug: 1,
        description: 1,
        category: {
          _id: '$category._id',
          name: '$category.name',
          slug: '$category.slug',
          isActive: '$category.isActive',
        },
        thumbnail: 1,
        thumbnailHorizontal: 1,
        thumbnailVertical: 1,
        thumbnailUrl: 1,
        thumbnailVerticalUrl: 1,
        averageRating: 1,
        totalStarted: 1,
        totalCompleted: 1,
        totalWishlisted: 1,
        completionRate: 1,
        publishedAt: 1,
        createdAt: 1,
        videoCount: { $size: { $ifNull: ['$videos', []] } },
      },
    },
  ]);
}

const adminLoginRateBuckets = new Map();
const ADMIN_LOGIN_WINDOW_MS = isProduction ? 15 * 60 * 1000 : 5 * 60 * 1000;
const ADMIN_LOGIN_BLOCK_MS = isProduction ? 15 * 60 * 1000 : 60 * 1000;
const ADMIN_LOGIN_MAX_ATTEMPTS = isProduction ? 5 : 50;

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || req.ip || 'unknown').toString().split(',')[0].trim();
}

function getAdminLoginRateState(req) {
  const key = getClientIp(req);
  const now = Date.now();
  const current = adminLoginRateBuckets.get(key) || { count: 0, firstAttemptAt: now, blockedUntil: 0 };

  if (current.blockedUntil > now) {
    return { key, blockedSeconds: Math.ceil((current.blockedUntil - now) / 1000), state: current };
  }

  if (now > current.firstAttemptAt + ADMIN_LOGIN_WINDOW_MS) {
    current.count = 0;
    current.firstAttemptAt = now;
    current.blockedUntil = 0;
  }

  return { key, blockedSeconds: 0, state: current };
}

function recordAdminLoginFailure(key, state) {
  const next = {
    ...state,
    count: state.count + 1,
  };

  if (next.count > ADMIN_LOGIN_MAX_ATTEMPTS) {
    next.blockedUntil = Date.now() + ADMIN_LOGIN_BLOCK_MS;
  }

  adminLoginRateBuckets.set(key, next);
}

function clearAdminLoginRate(key) {
  adminLoginRateBuckets.delete(key);
}

function safeEqualString(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function protectAdmin(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No admin authorization token provided' });
    }

    const decoded = jwt.verify(token, ADMIN_TOKEN_SECRET);

    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.admin = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid admin token' });
  }
}

app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;
  if (!isProduction && !FRONTEND_ORIGINS.length) {
    res.header('Access-Control-Allow-Origin', '*');
  } else if (requestOrigin && FRONTEND_ORIGINS.includes(requestOrigin)) {
    res.header('Access-Control-Allow-Origin', requestOrigin);
    res.header('Vary', 'Origin');
  }
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});
app.use('/api/webhooks/phonepe', express.raw({ type: '*/*', limit: '2mb' }));
app.use((req, res, next) => {
  if (req.path === '/api/webhooks/phonepe') {
    return next();
  }

  return jsonParser(req, res, next);
});
app.use(urlencodedParser);
app.use((error, req, res, next) => {
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Upload is too large. Please reduce the request payload.',
    });
  }

  return next(error);
});
if (SERVE_FRONTEND) {
  app.use(express.static(FRONTEND_DIR, {
    setHeaders(res, filePath) {
      if (/\.(?:html|css|js)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'no-store');
      }
    },
  }));
}

// MongoDB Connection
if (!/^mongodb(\+srv)?:\/\//.test(MONGODB_URI)) {
  console.error('❌ MongoDB connection error: MONGODB_URI must start with mongodb:// or mongodb+srv://');
} else {
  mongoose.connect(MONGODB_URI).then(() => {
    console.log('✅ MongoDB connected');
    if (process.env.DISABLE_BACKGROUND_JOBS !== 'true') {
      require('./jobs/courseStatsJob');
      require('./jobs/subscriptionTasks');
    }
  }).catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
  });
}

// Root route
app.get('/', (req, res) => {
  if (SERVE_FRONTEND) {
    return res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
  }

  return res.json({ ok: true, service: 'EduNex API' });
});

app.get('/admin', (req, res) => {
  if (SERVE_FRONTEND) {
    return res.sendFile(path.join(FRONTEND_DIR, 'admin-login.html'));
  }

  return res.status(404).json({ error: 'Admin frontend is not deployed with this service' });
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'EduNex API',
    uptimeSeconds: Math.round(process.uptime()),
    cache: getCacheBackend(),
  });
});

app.get('/api/health/db', async (req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const state = states[mongoose.connection.readyState] || 'unknown';

  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      ok: false,
      state,
      database: mongoose.connection.name || null,
    });
  }

  try {
    const [totalCourses, publishedCourses] = await Promise.all([
      Course.countDocuments({}),
      Course.countDocuments({ status: 'published' }),
    ]);

    res.json({
      ok: true,
      state,
      database: mongoose.connection.name,
      courseCollection: Course.collection.name,
      totalCourses,
      publishedCourses,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      state,
      database: mongoose.connection.name || null,
      error: error.message,
    });
  }
});

function normalizeBunnyRegion(region) {
  const value = String(region || '').trim().toLowerCase();
  if (!value || value === 'de' || value === 'germany') return '';
  if (['sg', 'singapore'].includes(value)) return 'sg';
  if (['ny', 'newyork', 'new-york', 'us'].includes(value)) return 'ny';
  if (['la', 'losangeles', 'los-angeles'].includes(value)) return 'la';
  if (['se', 'stockholm', 'sweden'].includes(value)) return 'se';
  if (['uk', 'london'].includes(value)) return 'uk';
  if (['br', 'sao-paulo', 'saopaulo', 'brazil'].includes(value)) return 'br';
  if (['jh', 'johannesburg', 'south-africa'].includes(value)) return 'jh';
  if (['syd', 'sydney', 'australia'].includes(value)) return 'syd';
  return value;
}

function encodeBunnyPath(value) {
  return String(value || '')
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function joinUrl(base, filePath) {
  return new URL(encodeBunnyPath(filePath), String(base || '').endsWith('/') ? base : `${base}/`).href;
}

function parseBunnyStreamUrl(value) {
  const rawUrl = String(value || '').trim();
  if (!rawUrl) return null;

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (_) {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  const parts = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  let libraryId = null;
  let videoId = null;

  if (hostname === 'player.mediadelivery.net' || hostname === 'iframe.mediadelivery.net') {
    const embedIndex = parts.indexOf('embed');
    if (embedIndex >= 0) {
      libraryId = parts[embedIndex + 1];
      videoId = parts[embedIndex + 2];
    }

    const playIndex = parts.indexOf('play');
    if (playIndex >= 0) {
      libraryId = parts[playIndex + 1];
      videoId = parts[playIndex + 2];
    }
  }

  if (hostname === 'video.bunnycdn.com') {
    const playIndex = parts.indexOf('play');
    if (playIndex >= 0) {
      libraryId = parts[playIndex + 1];
      videoId = parts[playIndex + 2];
    }
  }

  if (hostname.endsWith('.b-cdn.net')) {
    const playlistIndex = parts.indexOf('playlist.m3u8');
    videoId = playlistIndex > 0 ? parts[playlistIndex - 1] : parts[0];
    libraryId = BUNNY_STREAM_LIBRARY_ID || null;
  }

  if (!libraryId || !videoId) return null;

  const cleanLibraryId = String(libraryId).trim();
  const cleanVideoId = String(videoId).trim();

  if (!cleanLibraryId || !cleanVideoId) return null;

  return {
    sourceType: 'bunny_stream',
    videoUrl: rawUrl,
    embedUrl: `https://player.mediadelivery.net/embed/${encodeURIComponent(cleanLibraryId)}/${encodeURIComponent(cleanVideoId)}`,
    bunnyLibraryId: cleanLibraryId,
    bunnyVideoId: cleanVideoId,
  };
}

function sanitizeOptionalUrl(value) {
  return String(value || '').trim() || null;
}

function sanitizeCourseVideos(rawVideos) {
  if (!Array.isArray(rawVideos)) return null;

  const validVideoInputs = rawVideos.filter((video) => video && typeof video === 'object');
  const sanitizedVideos = validVideoInputs
    .map((video, index) => {
      const title = String(video.title || `Video ${index + 1}`).trim();
      const description = String(video.description || '').trim();
      const transcriptUrl = String(video.transcriptUrl || '').trim() || null;
      const duration = Number(video.duration) || 0;
      const youtubeId = String(video.youtubeId || '').trim();

      if (youtubeId) {
        return {
          title,
          description,
          sourceType: 'youtube',
          videoUrl: null,
          embedUrl: `https://www.youtube.com/embed/${youtubeId}`,
          bunnyVideoId: null,
          bunnyLibraryId: null,
          youtubeId,
          thumbnail: null,
          thumbnailUrl: null,
          transcriptUrl,
          duration,
          order: index + 1,
        };
      }

      const bunnyVideo = parseBunnyStreamUrl(video.embedUrl || video.videoUrl || video.url);
      if (!bunnyVideo) {
        return null;
      }

      return {
        title,
        description,
        ...bunnyVideo,
        youtubeId: null,
        thumbnail: null,
        thumbnailUrl: null,
        transcriptUrl,
        duration,
        order: index + 1,
      };
    })
    .filter(Boolean);

  if (!sanitizedVideos.length || sanitizedVideos.length !== validVideoInputs.length) {
    return null;
  }

  return sanitizedVideos;
}

function applyCourseThumbnailToVideos(videos, courseThumbnail, courseThumbnailUrl) {
  const sharedThumbnailUrl = sanitizeOptionalUrl(courseThumbnailUrl);

  return (Array.isArray(videos) ? videos : []).map((video) => ({
    ...video,
    thumbnail: null,
    thumbnailUrl: sharedThumbnailUrl,
  }));
}

async function listBunnyStorageVideos(folderPath = '') {
  const region = normalizeBunnyRegion(BUNNY_STORAGE_REGION);
  const host = region ? `${region}.storage.bunnycdn.com` : 'storage.bunnycdn.com';
  const folder = encodeBunnyPath(folderPath);
  const listUrl = `https://${host}/${encodeURIComponent(BUNNY_STORAGE_ZONE)}/${folder}${folder ? '/' : ''}`;
  const response = await fetch(listUrl, {
    headers: {
      AccessKey: BUNNY_STORAGE_ACCESS_KEY,
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Bunny Storage returned ${response.status}: ${detail || response.statusText}`);
  }

  const entries = await response.json();
  const videos = [];

  for (const entry of entries) {
    const name = entry.ObjectName || '';
    if (!name) continue;

    const entryPath = [folderPath, name].filter(Boolean).join('/');
    if (entry.IsDirectory) {
      videos.push(...await listBunnyStorageVideos(entryPath));
      continue;
    }

    if (!/\.(mp4|webm|ogg|mov|m4v)$/i.test(name)) continue;

    videos.push({
      name,
      path: entryPath,
      url: joinUrl(BUNNY_PULL_ZONE_URL, entryPath),
      size: entry.Length || 0,
      lastChanged: entry.LastChanged || entry.DateCreated || null,
    });
  }

  return videos;
}

async function listBunnyStreamVideos(page = 1, allVideos = []) {
  const listUrl = `https://video.bunnycdn.com/library/${encodeURIComponent(BUNNY_STREAM_LIBRARY_ID)}/videos?page=${page}&itemsPerPage=100&orderBy=date`;
  const response = await fetch(listUrl, {
    headers: {
      AccessKey: BUNNY_STREAM_API_KEY,
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Bunny Stream returned ${response.status}: ${detail || response.statusText}`);
  }

  const data = await response.json();
  const items = Array.isArray(data.items) ? data.items : [];
  const videos = allVideos.concat(items.map((video) => {
    const guid = video.guid || video.videoId || video.id;

    return {
      id: guid,
      name: video.title || video.name || guid || 'Untitled video',
      title: video.title || video.name || 'Untitled video',
      status: video.status,
      duration: video.length || video.duration || 0,
      size: video.storageSize || video.size || 0,
      lastChanged: video.dateUploaded || video.dateModified || video.createdAt || null,
      embedUrl: `https://player.mediadelivery.net/embed/${encodeURIComponent(BUNNY_STREAM_LIBRARY_ID)}/${encodeURIComponent(guid)}`,
      directPlayUrl: `https://video.bunnycdn.com/play/${encodeURIComponent(BUNNY_STREAM_LIBRARY_ID)}/${encodeURIComponent(guid)}`,
      hlsUrl: BUNNY_PULL_ZONE_URL ? joinUrl(BUNNY_PULL_ZONE_URL, `${guid}/playlist.m3u8`) : null,
      thumbnailUrl: video.thumbnailFileName
        ? joinUrl(BUNNY_PULL_ZONE_URL, `${guid}/${video.thumbnailFileName}`)
        : null,
      source: 'stream',
    };
  }).filter((video) => video.id));

  const totalItems = Number(data.totalItems || data.TotalItems || videos.length);
  const hasMore = videos.length < totalItems && items.length > 0;

  return hasMore ? listBunnyStreamVideos(page + 1, videos) : videos;
}

app.get('/api/bunny/videos', protectAdmin, async (req, res) => {
  try {
    if (BUNNY_STREAM_LIBRARY_ID && BUNNY_STREAM_API_KEY) {
      const videos = await listBunnyStreamVideos();
      videos.sort((a, b) => String(b.lastChanged || '').localeCompare(String(a.lastChanged || '')));

      return res.json({
        source: 'stream',
        libraryId: BUNNY_STREAM_LIBRARY_ID,
        videos,
      });
    }

    if (!BUNNY_STORAGE_ZONE || !BUNNY_STORAGE_ACCESS_KEY) {
      return res.status(500).json({
        error: 'Bunny Stream is not configured. Set BUNNY_STREAM_LIBRARY_ID and BUNNY_STREAM_API_KEY in backend/.env.local.',
      });
    }

    const folder = String(req.query.path || '').trim().replace(/^\/+|\/+$/g, '');
    const videos = await listBunnyStorageVideos(folder);
    videos.sort((a, b) => String(b.lastChanged || '').localeCompare(String(a.lastChanged || '')));

    res.json({
      source: 'storage',
      pullZoneUrl: BUNNY_PULL_ZONE_URL,
      storageZone: BUNNY_STORAGE_ZONE,
      region: normalizeBunnyRegion(BUNNY_STORAGE_REGION) || 'de',
      folder,
      videos,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const rateState = getAdminLoginRateState(req);

  if (rateState.blockedSeconds) {
    return res.status(429).json({
      error: `Too many admin login attempts. Try again in ${rateState.blockedSeconds} seconds.`,
    });
  }

  if (!password) {
    return res.status(400).json({ error: 'Admin password is required' });
  }

  if (!safeEqualString(password, ADMIN_PASSWORD)) {
    recordAdminLoginFailure(rateState.key, rateState.state);
    return res.status(401).json({ error: 'Invalid admin password' });
  }

  clearAdminLoginRate(rateState.key);

  const adminToken = jwt.sign(
    { role: 'admin', name: 'EduNex Admin' },
    ADMIN_TOKEN_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    adminToken,
    token: adminToken,
    admin: {
      name: 'EduNex Admin',
      role: 'admin',
    },
  });
});

function proxyValidationError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isAllowedProxyHostname(hostname) {
  const normalized = String(hostname || '').toLowerCase();
  if (!IMAGE_PROXY_ALLOWED_HOSTS.length) return true;
  return IMAGE_PROXY_ALLOWED_HOSTS.some((allowed) => (
    normalized === allowed || normalized.endsWith(`.${allowed}`)
  ));
}

function isBlockedHostname(hostname) {
  const normalized = String(hostname || '').toLowerCase();
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
    || normalized.endsWith('.internal')
    || normalized.endsWith('.test');
}

function isPrivateIp(address) {
  const version = net.isIP(address);
  if (!version) return false;

  if (version === 4) {
    const [a, b] = address.split('.').map(Number);
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || a >= 224;
  }

  const normalized = address.toLowerCase();
  return normalized === '::1'
    || normalized === '::'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80:')
    || normalized.startsWith('::ffff:127.')
    || normalized.startsWith('::ffff:10.')
    || normalized.startsWith('::ffff:192.168.')
    || /^::ffff:172\.(1[6-9]|2\d|3[0-1])\./.test(normalized);
}

async function validateImageProxyTarget(target) {
  const hostname = target.hostname;

  if (!isAllowedProxyHostname(hostname)) {
    throw proxyValidationError('Image host is not allowed', 403);
  }

  if (isBlockedHostname(hostname) || isPrivateIp(hostname)) {
    throw proxyValidationError('Image host is not allowed', 400);
  }

  const addresses = await dns.lookup(hostname, { all: true, verbatim: false });
  if (!addresses.length || addresses.some((entry) => isPrivateIp(entry.address))) {
    throw proxyValidationError('Image host resolved to a private address', 400);
  }
}

app.get('/api/image-proxy', async (req, res) => {
  const rawUrl = String(req.query.url || '').trim();
  let target;

  try {
    target = new URL(rawUrl);
  } catch (_) {
    return res.status(400).send('Invalid image URL');
  }

  if (!['http:', 'https:'].includes(target.protocol)) {
    return res.status(400).send('Unsupported image URL');
  }

  try {
    await validateImageProxyTarget(target);
  } catch (error) {
    return res.status(error.statusCode || 400).send(error.message);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const upstream = await fetch(target.href, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'EduNex image proxy',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });

    clearTimeout(timeout);

    if (!upstream.ok) {
      return res.status(upstream.status).send('Image unavailable');
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    if (!contentType.toLowerCase().startsWith('image/')) {
      return res.status(415).send('URL did not return an image');
    }

    const imageBuffer = Buffer.from(await upstream.arrayBuffer());
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    return res.send(imageBuffer);
  } catch (error) {
    clearTimeout(timeout);
    return res.status(502).send('Could not fetch image');
  }
});

// Auth Routes
app.use('/api', (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: 'Database is not connected. Check MONGODB_URI in backend/.env and restart the server.',
    });
  }

  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api', paymentRoutes);
app.use('/api', sessionRoutes);
app.use('/api', contentRoutes);
app.use('/api', mobileCompatRoutes);

const ANALYTICS_TIMEZONE = process.env.ANALYTICS_TIMEZONE || 'Asia/Kolkata';

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseAnalyticsDate(value, fallback) {
  if (!value) {
    return fallback;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function getAnalyticsRange(query) {
  const today = new Date();
  const defaultStart = new Date(today);
  defaultStart.setDate(today.getDate() - 29);

  const startDate = startOfDay(parseAnalyticsDate(query.startDate, defaultStart));
  const endDate = endOfDay(parseAnalyticsDate(query.endDate, today));

  if (startDate > endDate) {
    return { startDate: startOfDay(endDate), endDate: endOfDay(startDate) };
  }

  return { startDate, endDate };
}

function buildDayMap(startDate, endDate) {
  const days = [];
  const cursor = startOfDay(startDate);

  while (cursor <= endDate) {
    const key = formatDateKey(cursor);
    days.push({
      date: key,
      users: 0,
      subscriptions: 0,
      paidOrders: 0,
      revenue: 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function groupCount(items, keyField, valueField = 'count') {
  return items.reduce((acc, item) => {
    acc[item[keyField] || 'unknown'] = item[valueField] || 0;
    return acc;
  }, {});
}

app.get('/api/admin/analytics', protectAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = getAnalyticsRange(req.query);
    const rangeFilter = { $gte: startDate, $lte: endDate };
    const rangeStartKey = formatDateKey(startDate);
    const rangeEndKey = formatDateKey(endDate);
    const analyticsEventFilter = {
      event: { $in: ['video_start', 'video_progress', 'video_complete', 'video_watch'] },
      $or: [
        { date: { $gte: rangeStartKey, $lte: rangeEndKey } },
        { createdAt: rangeFilter },
      ],
    };
    const analyticsDownloadFilter = {
      event: 'video_download',
      $or: [
        { date: { $gte: rangeStartKey, $lte: rangeEndKey } },
        { createdAt: rangeFilter },
      ],
    };
    const subscriberStatuses = ['active', 'subscribed'];
    const trialStatuses = ['1rs trial', 'trial'];

    const [
      totalUsers,
      activeUsers,
      inactiveUsers,
      mobileVerifiedUsers,
      emailVerifiedUsers,
      marketingOptInUsers,
      totalCourses,
      publishedCourses,
      draftCourses,
      totalLessons,
      previewLessons,
      totalReviews,
      totalWishlists,
      totalSubscriptions,
      activeSubscriptions,
      trialSubscriptions,
      oneRupeeTrialUsers,
      trialUsers,
      subscribedUsers,
      noSubscriptionUsers,
      cancelledUsers,
      expiredUsers,
      pausedSubscriptions,
      usersWithoutSubscriptionDoc,
      newUsers,
      newSubscriptions,
      newCourses,
      newOrders,
      paidOrdersInRange,
      failedOrdersInRange,
      pendingOrdersInRange,
      revenueInRange,
      totalRevenue,
      orderStatusBreakdown,
      orderTypeBreakdown,
      paymentInstrumentBreakdown,
      subscriptionStatusBreakdown,
      userSubscriptionStatusBreakdown,
      genderBreakdown,
      ageBreakdown,
      courseProgressRows,
      topCourseProgressRows,
      watchedVideoRows,
      topWatchedVideoRows,
      mostWatchedCourseRows,
      progressWatchTotals,
      analyticsWatchRows,
      analyticsTopVideoRows,
      analyticsMostWatchedCourseRows,
      analyticsWatchTotals,
      videoDownloadRows,
      courseAnalyticsRows,
      dailyCourseAnalyticsRows,
      dailyUsers,
      dailySubscriptions,
      dailyPaidOrders,
      dailyRevenue,
      recentSubscriptions,
      recentUsers,
      recentOrders,
      recentEvents,
      recentContactEnquiries,
      topCourses,
      courseStatusRows,
      categoryRows,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ isActive: false }),
      User.countDocuments({ isMobileVerified: true }),
      User.countDocuments({ isEmailVerified: true }),
      User.countDocuments({ marketingOptIn: true }),
      Course.countDocuments(),
      Course.countDocuments({ status: 'published' }),
      Course.countDocuments({ status: 'draft' }),
      Lesson.countDocuments(),
      Lesson.countDocuments({ isPreview: true }),
      Review.countDocuments(),
      Wishlist.countDocuments(),
      Subscription.countDocuments(),
      Subscription.countDocuments({ status: { $in: subscriberStatuses } }),
      Subscription.countDocuments({ status: { $in: trialStatuses } }),
      User.countDocuments({ subscriptionStatus: '1rs trial' }),
      User.countDocuments({ subscriptionStatus: 'trial' }),
      User.countDocuments({ subscriptionStatus: { $in: subscriberStatuses } }),
      User.countDocuments({
        $or: [
          { subscriptionStatus: 'none' },
          { subscriptionStatus: null },
          { subscriptionStatus: { $exists: false } },
        ],
      }),
      User.countDocuments({ subscriptionStatus: 'cancelled' }),
      User.countDocuments({ subscriptionStatus: 'expired' }),
      Subscription.countDocuments({ status: 'paused' }),
      User.countDocuments({
        $or: [
          { subscriptionId: null },
          { subscriptionId: { $exists: false } },
        ],
      }),
      User.countDocuments({ createdAt: rangeFilter }),
      Subscription.countDocuments({ createdAt: rangeFilter }),
      Course.countDocuments({ createdAt: rangeFilter }),
      Order.countDocuments({ createdAt: rangeFilter }),
      Order.countDocuments({ status: 'paid', createdAt: rangeFilter }),
      Order.countDocuments({ status: 'failed', createdAt: rangeFilter }),
      Order.countDocuments({ status: 'pending', createdAt: rangeFilter }),
      Order.aggregate([
        { $match: { status: 'paid', createdAt: rangeFilter } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, average: { $avg: '$totalAmount' } } },
      ]),
      Order.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Order.aggregate([{ $group: { _id: '$orderType', count: { $sum: 1 }, amount: { $sum: '$totalAmount' } } }]),
      Order.aggregate([{ $group: { _id: '$phonePePaymentInstrument', count: { $sum: 1 } } }]),
      Subscription.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      User.aggregate([{ $group: { _id: '$subscriptionStatus', count: { $sum: 1 } } }]),
      User.aggregate([
        {
          $group: {
            _id: {
              $cond: [
                { $in: ['$gender', ['male', 'female', 'other']] },
                '$gender',
                'not provided',
              ],
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),
      User.aggregate([
        {
          $bucket: {
            groupBy: '$age',
            boundaries: [5, 13, 18, 25, 35, 45, 81],
            default: 'not provided',
            output: { count: { $sum: 1 } },
          },
        },
      ]),
      Progress.aggregate([
        { $match: { lastWatchedAt: rangeFilter } },
        {
          $group: {
            _id: '$course',
            learnerIds: { $addToSet: '$user' },
            progressRecords: { $sum: 1 },
            completedRecords: { $sum: { $cond: ['$completed', 1, 0] } },
            dropOffs: { $sum: { $cond: [{ $ne: ['$dropOffPoint', null] }, 1, 0] } },
          },
        },
        {
          $lookup: {
            from: 'courses',
            localField: '_id',
            foreignField: '_id',
            as: 'course',
          },
        },
        { $unwind: { path: '$course', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            courseId: '$_id',
            title: { $ifNull: ['$course.title', 'Unknown course'] },
            learnerIds: 1,
            learnerCount: { $size: '$learnerIds' },
            progressRecords: 1,
            completedRecords: 1,
            dropOffs: 1,
          },
        },
        { $sort: { progressRecords: -1, learnerCount: -1, completedRecords: -1 } },
      ]),
      CourseProgress.aggregate([
        { $match: { courseTitle: { $nin: [null, ''] } } },
        {
          $group: {
            _id: '$courseTitle',
            courseIds: { $addToSet: '$courseId' },
            learnerIds: { $addToSet: '$userId' },
            progressRecords: { $sum: 1 },
            completedRecords: { $sum: '$completedCount' },
            averageProgress: { $avg: '$progressPercent' },
            lastUpdatedAt: { $max: '$updatedAt' },
          },
        },
        {
          $project: {
            title: '$_id',
            courseIds: 1,
            learnerCount: { $size: '$learnerIds' },
            progressRecords: 1,
            completedRecords: 1,
            averageProgress: { $round: [{ $ifNull: ['$averageProgress', 0] }, 2] },
            lastUpdatedAt: 1,
          },
        },
        { $sort: { progressRecords: -1, learnerCount: -1, completedRecords: -1, lastUpdatedAt: -1 } },
        { $limit: 8 },
      ]),
      Progress.aggregate([
        { $match: { lastWatchedAt: rangeFilter } },
        {
          $lookup: {
            from: 'users',
            localField: 'user',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'lessons',
            localField: 'lesson',
            foreignField: '_id',
            as: 'lesson',
          },
        },
        { $unwind: { path: '$lesson', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'courses',
            localField: 'course',
            foreignField: '_id',
            as: 'course',
          },
        },
        { $unwind: { path: '$course', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            videoIndex: { $ifNull: ['$lesson.videoIndex', 0] },
          },
        },
        {
          $addFields: {
            video: {
              $cond: [
                { $isArray: '$course.videos' },
                { $arrayElemAt: ['$course.videos', '$videoIndex'] },
                null,
              ],
            },
          },
        },
        {
          $project: {
            userId: '$user._id',
            learnerName: { $ifNull: ['$user.fullName', 'Learner'] },
            learnerEmail: { $ifNull: ['$user.email', '$user.mobileNumber'] },
            courseId: '$course._id',
            courseTitle: { $ifNull: ['$course.title', 'Unknown course'] },
            lessonId: '$lesson._id',
            videoIndex: 1,
            videoTitle: { $ifNull: ['$video.title', { $ifNull: ['$lesson.title', 'Unknown video'] }] },
            watchedSeconds: { $ifNull: ['$watchedSeconds', 0] },
            watchedMinutes: { $round: [{ $divide: [{ $ifNull: ['$watchedSeconds', 0] }, 60] }, 1] },
            durationSeconds: { $ifNull: ['$video.duration', 0] },
            completed: 1,
            dropOffPoint: 1,
            lastWatchedAt: 1,
          },
        },
        { $sort: { watchedSeconds: -1, lastWatchedAt: -1 } },
        { $limit: 24 },
      ]),
      Progress.aggregate([
        { $match: { lastWatchedAt: rangeFilter } },
        {
          $group: {
            _id: { course: '$course', lesson: '$lesson' },
            learnerIds: { $addToSet: '$user' },
            totalWatchSeconds: { $sum: { $ifNull: ['$watchedSeconds', 0] } },
            progressRecords: { $sum: 1 },
            completedRecords: { $sum: { $cond: ['$completed', 1, 0] } },
            dropOffs: { $sum: { $cond: [{ $ne: ['$dropOffPoint', null] }, 1, 0] } },
            lastWatchedAt: { $max: '$lastWatchedAt' },
          },
        },
        {
          $lookup: {
            from: 'lessons',
            localField: '_id.lesson',
            foreignField: '_id',
            as: 'lesson',
          },
        },
        { $unwind: { path: '$lesson', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'courses',
            localField: '_id.course',
            foreignField: '_id',
            as: 'course',
          },
        },
        { $unwind: { path: '$course', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            videoIndex: { $ifNull: ['$lesson.videoIndex', 0] },
          },
        },
        {
          $addFields: {
            video: {
              $cond: [
                { $isArray: '$course.videos' },
                { $arrayElemAt: ['$course.videos', '$videoIndex'] },
                null,
              ],
            },
          },
        },
        {
          $project: {
            courseId: '$_id.course',
            courseTitle: { $ifNull: ['$course.title', 'Unknown course'] },
            lessonId: '$_id.lesson',
            videoIndex: 1,
            videoTitle: { $ifNull: ['$video.title', { $ifNull: ['$lesson.title', 'Unknown video'] }] },
            learnerCount: { $size: '$learnerIds' },
            totalWatchSeconds: 1,
            totalWatchMinutes: { $round: [{ $divide: ['$totalWatchSeconds', 60] }, 1] },
            progressRecords: 1,
            completedRecords: 1,
            dropOffs: 1,
            lastWatchedAt: 1,
          },
        },
        { $sort: { totalWatchSeconds: -1, learnerCount: -1, completedRecords: -1 } },
        { $limit: 12 },
      ]),
      Progress.aggregate([
        { $match: { lastWatchedAt: rangeFilter } },
        {
          $group: {
            _id: '$course',
            learnerIds: { $addToSet: '$user' },
            lessonIds: { $addToSet: '$lesson' },
            totalWatchSeconds: { $sum: { $ifNull: ['$watchedSeconds', 0] } },
            progressRecords: { $sum: 1 },
            completedRecords: { $sum: { $cond: ['$completed', 1, 0] } },
            dropOffs: { $sum: { $cond: [{ $ne: ['$dropOffPoint', null] }, 1, 0] } },
            lastWatchedAt: { $max: '$lastWatchedAt' },
          },
        },
        {
          $lookup: {
            from: 'courses',
            localField: '_id',
            foreignField: '_id',
            as: 'course',
          },
        },
        { $unwind: { path: '$course', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            courseId: '$_id',
            title: { $ifNull: ['$course.title', 'Unknown course'] },
            status: '$course.status',
            learnerCount: { $size: '$learnerIds' },
            videosWatched: { $size: '$lessonIds' },
            totalWatchSeconds: 1,
            totalWatchMinutes: { $round: [{ $divide: ['$totalWatchSeconds', 60] }, 1] },
            progressRecords: 1,
            completedRecords: 1,
            dropOffs: 1,
            lastWatchedAt: 1,
          },
        },
        { $sort: { totalWatchSeconds: -1, learnerCount: -1, completedRecords: -1 } },
        { $limit: 12 },
      ]),
      Progress.aggregate([
        { $match: { lastWatchedAt: rangeFilter } },
        {
          $group: {
            _id: null,
            totalWatchSeconds: { $sum: { $ifNull: ['$watchedSeconds', 0] } },
            progressRecords: { $sum: 1 },
            completedRecords: { $sum: { $cond: ['$completed', 1, 0] } },
          },
        },
      ]),
      AnalyticsEvent.aggregate([
        { $match: analyticsEventFilter },
        {
          $addFields: {
            watchedSeconds: { $ifNull: ['$watchSeconds', { $ifNull: ['$watchedSeconds', '$durationSeconds'] }] },
            lastWatchedAt: { $ifNull: ['$createdAt', { $toDate: '$date' }] },
            courseObjectId: {
              $convert: {
                input: '$courseId',
                to: 'objectId',
                onError: null,
                onNull: null,
              },
            },
            videoIdString: { $toString: '$videoId' },
          },
        },
        {
          $lookup: {
            from: 'courses',
            localField: 'courseObjectId',
            foreignField: '_id',
            as: 'course',
          },
        },
        { $unwind: { path: '$course', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            matchedVideo: {
              $first: {
                $filter: {
                  input: { $ifNull: ['$course.videos', []] },
                  as: 'video',
                  cond: {
                    $or: [
                      { $eq: [{ $toString: '$$video._id' }, '$videoIdString'] },
                      { $eq: ['$$video.bunnyVideoId', '$videoIdString'] },
                      { $eq: ['$$video.youtubeId', '$videoIdString'] },
                    ],
                  },
                },
              },
            },
          },
        },
        {
          $project: {
            userId: 1,
            learnerName: { $ifNull: ['$userName', 'Learner'] },
            learnerEmail: { $ifNull: ['$userEmail', ''] },
            courseId: 1,
            courseTitle: { $ifNull: ['$course.title', { $ifNull: ['$courseTitle', 'Unknown course'] }] },
            lessonId: '$videoId',
            videoId: 1,
            videoTitle: { $ifNull: ['$matchedVideo.title', { $ifNull: ['$videoTitle', { $ifNull: ['$lessonTitle', '$videoId'] }] }] },
            videoIndex: { $ifNull: ['$videoIndex', 0] },
            watchedSeconds: { $ifNull: ['$watchedSeconds', 0] },
            watchedMinutes: { $round: [{ $divide: [{ $ifNull: ['$watchedSeconds', 0] }, 60] }, 1] },
            durationSeconds: { $ifNull: ['$durationSeconds', 0] },
            completed: { $eq: ['$event', 'video_complete'] },
            dropOffPoint: null,
            lastWatchedAt: 1,
          },
        },
        { $sort: { lastWatchedAt: -1, watchedSeconds: -1 } },
        { $limit: 24 },
      ]),
      AnalyticsEvent.aggregate([
        { $match: analyticsEventFilter },
        {
          $addFields: {
            watchedSeconds: { $ifNull: ['$watchSeconds', { $ifNull: ['$watchedSeconds', '$durationSeconds'] }] },
            completedValue: { $cond: [{ $eq: ['$event', 'video_complete'] }, 1, 0] },
            courseObjectId: {
              $convert: {
                input: '$courseId',
                to: 'objectId',
                onError: null,
                onNull: null,
              },
            },
          },
        },
        {
          $group: {
            _id: {
              courseId: '$courseId',
              courseObjectId: '$courseObjectId',
              courseTitle: '$courseTitle',
              videoId: '$videoId',
              videoTitle: { $ifNull: ['$videoTitle', '$lessonTitle'] },
              videoIndex: { $ifNull: ['$videoIndex', 0] },
            },
            learnerIds: { $addToSet: '$userId' },
            totalWatchSeconds: { $sum: { $ifNull: ['$watchedSeconds', 0] } },
            progressRecords: { $sum: 1 },
            completedRecords: { $sum: '$completedValue' },
            lastWatchedAt: { $max: '$createdAt' },
          },
        },
        {
          $lookup: {
            from: 'courses',
            localField: '_id.courseObjectId',
            foreignField: '_id',
            as: 'course',
          },
        },
        { $unwind: { path: '$course', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            videoIdString: { $toString: '$_id.videoId' },
          },
        },
        {
          $addFields: {
            matchedVideo: {
              $first: {
                $filter: {
                  input: { $ifNull: ['$course.videos', []] },
                  as: 'video',
                  cond: {
                    $or: [
                      { $eq: [{ $toString: '$$video._id' }, '$videoIdString'] },
                      { $eq: ['$$video.bunnyVideoId', '$videoIdString'] },
                      { $eq: ['$$video.youtubeId', '$videoIdString'] },
                    ],
                  },
                },
              },
            },
          },
        },
        {
          $project: {
            courseId: '$_id.courseId',
            courseTitle: { $ifNull: ['$course.title', { $ifNull: ['$_id.courseTitle', 'Unknown course'] }] },
            lessonId: '$_id.videoId',
            videoId: '$_id.videoId',
            videoIndex: '$_id.videoIndex',
            videoTitle: { $ifNull: ['$matchedVideo.title', { $ifNull: ['$_id.videoTitle', '$_id.videoId'] }] },
            learnerCount: { $size: '$learnerIds' },
            totalWatchSeconds: 1,
            totalWatchMinutes: { $round: [{ $divide: ['$totalWatchSeconds', 60] }, 1] },
            progressRecords: 1,
            completedRecords: 1,
            dropOffs: { $literal: 0 },
            lastWatchedAt: 1,
          },
        },
        { $sort: { totalWatchSeconds: -1, learnerCount: -1, progressRecords: -1 } },
        { $limit: 12 },
      ]),
      AnalyticsEvent.aggregate([
        { $match: analyticsEventFilter },
        {
          $addFields: {
            watchedSeconds: { $ifNull: ['$watchSeconds', { $ifNull: ['$watchedSeconds', '$durationSeconds'] }] },
            completedValue: { $cond: [{ $eq: ['$event', 'video_complete'] }, 1, 0] },
          },
        },
        {
          $group: {
            _id: {
              courseId: '$courseId',
              courseTitle: '$courseTitle',
            },
            learnerIds: { $addToSet: '$userId' },
            videoIds: { $addToSet: '$videoId' },
            totalWatchSeconds: { $sum: { $ifNull: ['$watchedSeconds', 0] } },
            progressRecords: { $sum: 1 },
            completedRecords: { $sum: '$completedValue' },
            lastWatchedAt: { $max: '$createdAt' },
          },
        },
        {
          $project: {
            courseId: '$_id.courseId',
            title: { $ifNull: ['$_id.courseTitle', 'Unknown course'] },
            status: { $literal: 'tracked' },
            learnerCount: { $size: '$learnerIds' },
            videosWatched: { $size: '$videoIds' },
            totalWatchSeconds: 1,
            totalWatchMinutes: { $round: [{ $divide: ['$totalWatchSeconds', 60] }, 1] },
            progressRecords: 1,
            completedRecords: 1,
            dropOffs: { $literal: 0 },
            lastWatchedAt: 1,
          },
        },
        { $sort: { totalWatchSeconds: -1, learnerCount: -1, progressRecords: -1 } },
        { $limit: 12 },
      ]),
      AnalyticsEvent.aggregate([
        { $match: analyticsEventFilter },
        {
          $addFields: {
            watchedSeconds: { $ifNull: ['$watchSeconds', { $ifNull: ['$watchedSeconds', '$durationSeconds'] }] },
            completedValue: { $cond: [{ $eq: ['$event', 'video_complete'] }, 1, 0] },
          },
        },
        {
          $group: {
            _id: null,
            learnerIds: { $addToSet: '$userId' },
            totalWatchSeconds: { $sum: { $ifNull: ['$watchedSeconds', 0] } },
            progressRecords: { $sum: 1 },
            completedRecords: { $sum: '$completedValue' },
          },
        },
      ]),
      AnalyticsEvent.aggregate([
        { $match: analyticsDownloadFilter },
        {
          $addFields: {
            userObjectId: {
              $convert: {
                input: '$userId',
                to: 'objectId',
                onError: null,
                onNull: null,
              },
            },
            courseObjectId: {
              $convert: {
                input: '$courseId',
                to: 'objectId',
                onError: null,
                onNull: null,
              },
            },
            videoIdString: { $toString: '$videoId' },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: 'userObjectId',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'courses',
            localField: 'courseObjectId',
            foreignField: '_id',
            as: 'course',
          },
        },
        { $unwind: { path: '$course', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            matchedVideo: {
              $first: {
                $filter: {
                  input: { $ifNull: ['$course.videos', []] },
                  as: 'video',
                  cond: {
                    $or: [
                      { $eq: [{ $toString: '$$video._id' }, '$videoIdString'] },
                      { $eq: ['$$video.bunnyVideoId', '$videoIdString'] },
                      { $eq: ['$$video.youtubeId', '$videoIdString'] },
                    ],
                  },
                },
              },
            },
          },
        },
        {
          $project: {
            userId: 1,
            userName: { $ifNull: ['$user.fullName', { $ifNull: ['$userName', 'Learner'] }] },
            userEmail: { $ifNull: ['$user.email', '$userEmail'] },
            mobileNumber: { $ifNull: ['$user.mobileNumber', ''] },
            courseId: 1,
            courseTitle: { $ifNull: ['$course.title', { $ifNull: ['$courseTitle', 'Unknown course'] }] },
            videoId: 1,
            videoTitle: { $ifNull: ['$matchedVideo.title', { $ifNull: ['$videoTitle', '$videoId'] }] },
            resolution: { $ifNull: ['$resolution', 'Unknown'] },
            fileSizeBytes: { $ifNull: ['$fileSizeBytes', 0] },
            date: 1,
            createdAt: 1,
          },
        },
        { $sort: { createdAt: -1 } },
        { $limit: 24 },
      ]),
      CourseAnalytics.aggregate([
        { $match: { date: rangeFilter } },
        {
          $group: {
            _id: '$course',
            uniqueViewers: { $sum: '$uniqueViewers' },
            lessonsWatched: { $sum: '$lessonsWatched' },
            watchMinutes: { $sum: '$watchMinutes' },
            newStarts: { $sum: '$newStarts' },
            newCompletions: { $sum: '$newCompletions' },
            aiTutorQueries: { $sum: '$aiTutorQueries' },
          },
        },
        {
          $lookup: {
            from: 'courses',
            localField: '_id',
            foreignField: '_id',
            as: 'course',
          },
        },
        { $unwind: { path: '$course', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            courseId: '$_id',
            title: { $ifNull: ['$course.title', 'Unknown course'] },
            uniqueViewers: 1,
            lessonsWatched: 1,
            watchMinutes: 1,
            newStarts: 1,
            newCompletions: 1,
            aiTutorQueries: 1,
          },
        },
        { $sort: { watchMinutes: -1, uniqueViewers: -1, lessonsWatched: -1 } },
        { $limit: 12 },
      ]),
      CourseAnalytics.aggregate([
        { $match: { date: rangeFilter } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: ANALYTICS_TIMEZONE } },
            watchMinutes: { $sum: '$watchMinutes' },
            uniqueViewers: { $sum: '$uniqueViewers' },
            lessonsWatched: { $sum: '$lessonsWatched' },
            newStarts: { $sum: '$newStarts' },
            newCompletions: { $sum: '$newCompletions' },
            aiTutorQueries: { $sum: '$aiTutorQueries' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      User.aggregate([
        { $match: { createdAt: rangeFilter } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: ANALYTICS_TIMEZONE } }, count: { $sum: 1 } } },
      ]),
      Subscription.aggregate([
        { $match: { createdAt: rangeFilter } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: ANALYTICS_TIMEZONE } }, count: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { status: 'paid', createdAt: rangeFilter } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: ANALYTICS_TIMEZONE } }, count: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { status: 'paid', createdAt: rangeFilter } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: ANALYTICS_TIMEZONE } }, total: { $sum: '$totalAmount' } } },
      ]),
      Subscription.find()
        .sort({ createdAt: -1 })
        .limit(8)
        .populate('user', 'fullName email mobileNumber subscriptionStatus')
        .select('user status subscriptionType amount trialStartedAt trialExpiresAt currentPeriodEnd nextBillingAt createdAt'),
      User.find()
        .sort({ createdAt: -1 })
        .limit(8)
        .select('fullName email mobileNumber avatar gender age subscriptionStatus isMobileVerified createdAt lastActiveAt'),
      Order.find()
        .sort({ createdAt: -1 })
        .limit(8)
        .populate('user', 'fullName email')
        .select('user totalAmount status orderType phonePePaymentInstrument paidAt createdAt'),
      SubscriptionEvent.find()
        .sort({ createdAt: -1 })
        .limit(8)
        .populate('user', 'fullName email')
        .select('user event amount createdAt'),
      ContactEnquiry.find()
        .sort({ createdAt: -1 })
        .limit(8)
        .populate('userId', 'fullName email mobileNumber')
        .select('userId firstName lastName email message status createdAt'),
      Course.find()
        .sort({ totalStarted: -1, totalCompleted: -1, totalWishlisted: -1, createdAt: -1 })
        .limit(8)
        .populate('category', 'name')
        .select('title slug status averageRating totalStarted totalCompleted completionRate totalWatchMinutes averageProgress totalWishlisted createdAt publishedAt'),
      Course.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Course.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
        {
          $lookup: {
            from: 'categories',
            localField: '_id',
            foreignField: '_id',
            as: 'category',
          },
        },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
        { $project: { name: { $ifNull: ['$category.name', 'Uncategorized'] }, count: 1 } },
        { $sort: { count: -1 } },
      ]),
    ]);

    const dailySeries = buildDayMap(startDate, endDate);
    const dailyIndex = dailySeries.reduce((acc, item) => {
      acc[item.date] = item;
      return acc;
    }, {});

    dailyUsers.forEach((item) => {
      if (dailyIndex[item._id]) dailyIndex[item._id].users = item.count;
    });
    dailySubscriptions.forEach((item) => {
      if (dailyIndex[item._id]) dailyIndex[item._id].subscriptions = item.count;
    });
    dailyPaidOrders.forEach((item) => {
      if (dailyIndex[item._id]) dailyIndex[item._id].paidOrders = item.count;
    });
    dailyRevenue.forEach((item) => {
      if (dailyIndex[item._id]) dailyIndex[item._id].revenue = item.total || 0;
    });
    dailyCourseAnalyticsRows.forEach((item) => {
      if (dailyIndex[item._id]) {
        dailyIndex[item._id].watchMinutes = item.watchMinutes || 0;
        dailyIndex[item._id].uniqueViewers = item.uniqueViewers || 0;
        dailyIndex[item._id].lessonsWatched = item.lessonsWatched || 0;
        dailyIndex[item._id].courseStarts = item.newStarts || 0;
        dailyIndex[item._id].courseCompletions = item.newCompletions || 0;
        dailyIndex[item._id].aiTutorQueries = item.aiTutorQueries || 0;
      }
    });

    const topProgressCourse = topCourseProgressRows[0] || null;
    const activeLearnerIds = new Set();
    courseProgressRows.forEach((row) => {
      (row.learnerIds || []).forEach((userId) => activeLearnerIds.add(String(userId)));
    });
    const analyticsWatchTotal = analyticsWatchTotals[0] || {};
    const hasAnalyticsWatchEvents = Number(analyticsWatchTotal.progressRecords || 0) > 0;
    const progressWatchTotal = progressWatchTotals[0] || {};
    const activeLearnersInRange = hasAnalyticsWatchEvents
      ? (analyticsWatchTotal.learnerIds || []).filter(Boolean).length
      : activeLearnerIds.size;
    const totalWatchSecondsInRange = hasAnalyticsWatchEvents
      ? Number(analyticsWatchTotal.totalWatchSeconds || 0)
      : Number(progressWatchTotal.totalWatchSeconds || 0);
    const totalCompletedProgress = hasAnalyticsWatchEvents
      ? Number(analyticsWatchTotal.completedRecords || 0)
      : Number(progressWatchTotal.completedRecords || 0);
    const totalProgressRecords = hasAnalyticsWatchEvents
      ? Number(analyticsWatchTotal.progressRecords || 0)
      : Number(progressWatchTotal.progressRecords || 0);
    const dashboardWatchRows = hasAnalyticsWatchEvents ? analyticsWatchRows : watchedVideoRows;
    const dashboardTopWatchedVideos = hasAnalyticsWatchEvents ? analyticsTopVideoRows : topWatchedVideoRows;
    const dashboardMostWatchedCourses = hasAnalyticsWatchEvents ? analyticsMostWatchedCourseRows : mostWatchedCourseRows;
    const courseAnalyticsTotals = dailyCourseAnalyticsRows.reduce((acc, row) => {
      acc.watchMinutes += Number(row.watchMinutes || 0);
      acc.uniqueViewers += Number(row.uniqueViewers || 0);
      acc.lessonsWatched += Number(row.lessonsWatched || 0);
      acc.newStarts += Number(row.newStarts || 0);
      acc.newCompletions += Number(row.newCompletions || 0);
      acc.aiTutorQueries += Number(row.aiTutorQueries || 0);
      return acc;
    }, {
      watchMinutes: 0,
      uniqueViewers: 0,
      lessonsWatched: 0,
      newStarts: 0,
      newCompletions: 0,
      aiTutorQueries: 0,
    });
    const rangeRevenue = revenueInRange[0] || { total: 0, average: 0 };
    const allTimeRevenue = totalRevenue[0] || { total: 0 };
    const subscriptionStatusCounts = groupCount(subscriptionStatusBreakdown, '_id');
    const userSubscriptionStatusCounts = groupCount(userSubscriptionStatusBreakdown, '_id');
    const orderStatusCounts = groupCount(orderStatusBreakdown, '_id');
    const instrumentCounts = groupCount(paymentInstrumentBreakdown, '_id');
    const courseStatusCounts = groupCount(courseStatusRows, '_id');
    const ageBucketLabels = {
      5: '5-12',
      13: '13-17',
      18: '18-24',
      25: '25-34',
      35: '35-44',
      45: '45-80',
      'not provided': 'Not provided',
    };

    res.json({
      range: {
        startDate: formatDateKey(startDate),
        endDate: formatDateKey(endDate),
      },
      totals: {
        users: totalUsers,
        activeUsers,
        inactiveUsers,
        mobileVerifiedUsers,
        emailVerifiedUsers,
        marketingOptInUsers,
        courses: totalCourses,
        publishedCourses,
        draftCourses,
        lessons: totalLessons,
        previewLessons,
        reviews: totalReviews,
        wishlists: totalWishlists,
        subscriptions: totalSubscriptions,
        activeSubscriptions,
        trialSubscriptions,
        oneRupeeTrialUsers,
        trialUsers,
        subscribedUsers,
        noSubscriptionUsers,
        cancelledUsers,
        expiredUsers,
        pausedSubscriptions,
        usersWithoutSubscriptionDoc,
        revenueInRange: rangeRevenue.total || 0,
        averageOrderValue: Math.round(rangeRevenue.average || 0),
        totalRevenue: allTimeRevenue.total || 0,
        newUsers,
        newSubscriptions,
        newCourses,
        newOrders,
        paidOrdersInRange,
        failedOrdersInRange,
        pendingOrdersInRange,
      },
      breakdowns: {
        subscriptionStatus: subscriptionStatusCounts,
        userSubscriptionStatus: userSubscriptionStatusCounts,
        gender: genderBreakdown.map((item) => ({
          label: item._id || 'not provided',
          count: item.count,
        })),
        age: ageBreakdown.map((item) => ({
          label: ageBucketLabels[item._id] || String(item._id || 'Not provided'),
          count: item.count,
          order: typeof item._id === 'number' ? item._id : 999,
        })).sort((a, b) => a.order - b.order),
        orderStatus: orderStatusCounts,
        orderTypes: orderTypeBreakdown.map((item) => ({
          type: item._id || 'unknown',
          count: item.count,
          amount: item.amount || 0,
        })),
        paymentInstruments: instrumentCounts,
        courseStatus: courseStatusCounts,
        categories: categoryRows,
      },
      learning: {
        activeLearnersInRange,
        watchedMinutes: Math.round(totalWatchSecondsInRange / 60),
        completedProgress: totalCompletedProgress,
        completionShare: totalProgressRecords
          ? Math.round((totalCompletedProgress / totalProgressRecords) * 100)
          : 0,
        watchRows: dashboardWatchRows,
        topWatchedVideos: dashboardTopWatchedVideos,
        mostWatchedCourses: dashboardMostWatchedCourses,
        courseAnalytics: courseAnalyticsRows,
        courseAnalyticsTotals,
        topSellingCourse: topProgressCourse
          ? {
              title: topProgressCourse.title,
              learnerCount: topProgressCourse.learnerCount || 0,
              progressRecords: topProgressCourse.progressRecords || 0,
            }
          : null,
      },
      dailySeries,
      recentSubscriptions,
      recentUsers,
      recentOrders,
      recentEvents,
      recentContactEnquiries,
      videoDownloads: videoDownloadRows,
      topSellingCourses: topCourseProgressRows,
      topCourses,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/users', protectAdmin, async (req, res) => {
  try {
    const users = await User.find({ isActive: true })
      .sort({ fullName: 1, email: 1 })
      .select('fullName email isOnTrial createdAt');

    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/user-management', protectAdmin, async (req, res) => {
  try {
    const watchEventNames = ['video_start', 'video_progress', 'video_complete', 'video_watch'];
    const [users, progressRows, progressWatchRows, analyticsWatchRows] = await Promise.all([
      User.find()
        .sort({ createdAt: -1 })
        .select('fullName email mobileNumber avatar gender age subscriptionStatus isMobileVerified isEmailVerified isActive marketingOptIn createdAt lastActiveAt')
        .lean(),
      CourseProgress.aggregate([
        { $match: { userId: { $nin: [null, ''] } } },
        {
          $group: {
            _id: {
              userId: '$userId',
              courseTitle: '$courseTitle',
              courseId: '$courseId',
            },
            progressRecords: { $sum: 1 },
            completedCount: { $max: '$completedCount' },
            progressPercent: { $max: '$progressPercent' },
            totalVideos: { $max: '$totalVideos' },
            lastWatchedVideoId: { $last: '$lastWatchedVideoId' },
            lastCompletedVideoId: { $last: '$lastCompletedVideoId' },
            updatedAt: { $max: '$updatedAt' },
            createdAt: { $min: '$createdAt' },
          },
        },
        {
          $project: {
            _id: 0,
            userId: '$_id.userId',
            courseId: '$_id.courseId',
            courseTitle: { $ifNull: ['$_id.courseTitle', 'Untitled course'] },
            progressRecords: 1,
            completedCount: { $ifNull: ['$completedCount', 0] },
            progressPercent: { $ifNull: ['$progressPercent', 0] },
            totalVideos: { $ifNull: ['$totalVideos', 0] },
            lastWatchedVideoId: 1,
            lastCompletedVideoId: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
        { $sort: { updatedAt: -1, progressPercent: -1 } },
      ]),
      Progress.aggregate([
        {
          $group: {
            _id: '$user',
            totalWatchSeconds: { $sum: { $ifNull: ['$watchedSeconds', 0] } },
            watchedVideos: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$watchedSeconds', 0] }, 0] }, 1, 0] } },
            completedVideos: { $sum: { $cond: ['$completed', 1, 0] } },
            lastWatchedAt: { $max: '$lastWatchedAt' },
          },
        },
        {
          $project: {
            _id: 0,
            userId: { $toString: '$_id' },
            totalWatchSeconds: 1,
            watchedVideos: 1,
            completedVideos: 1,
            lastWatchedAt: 1,
          },
        },
      ]),
      AnalyticsEvent.aggregate([
        {
          $match: {
            event: { $in: watchEventNames },
            userId: { $nin: [null, ''] },
          },
        },
        {
          $addFields: {
            watchedSeconds: { $ifNull: ['$watchSeconds', { $ifNull: ['$watchedSeconds', '$durationSeconds'] }] },
            watchedUserId: { $toString: '$userId' },
          },
        },
        {
          $group: {
            _id: '$watchedUserId',
            totalWatchSeconds: { $sum: { $ifNull: ['$watchedSeconds', 0] } },
            watchedVideos: { $addToSet: '$videoId' },
            completedVideos: { $sum: { $cond: [{ $eq: ['$event', 'video_complete'] }, 1, 0] } },
            lastWatchedAt: { $max: '$createdAt' },
          },
        },
        {
          $project: {
            _id: 0,
            userId: '$_id',
            totalWatchSeconds: 1,
            watchedVideos: { $size: '$watchedVideos' },
            completedVideos: 1,
            lastWatchedAt: 1,
          },
        },
      ]),
    ]);

    const progressByUser = progressRows.reduce((acc, row) => {
      if (!acc[row.userId]) acc[row.userId] = [];
      acc[row.userId].push(row);
      return acc;
    }, {});

    const progressWatchByUser = progressWatchRows.reduce((acc, row) => {
      acc[row.userId] = row;
      return acc;
    }, {});
    const analyticsWatchByUser = analyticsWatchRows.reduce((acc, row) => {
      acc[row.userId] = row;
      return acc;
    }, {});
    const preferAnalyticsWatch = analyticsWatchRows.length > 0;

    res.json(users.map((user) => {
      const userProgress = progressByUser[String(user._id)] || [];
      const watch = (
        preferAnalyticsWatch
          ? analyticsWatchByUser[String(user._id)] || progressWatchByUser[String(user._id)]
          : progressWatchByUser[String(user._id)]
      ) || {};
      const watchedMinutes = Math.round(Number(watch.totalWatchSeconds || 0) / 60);
      const completedCourses = userProgress.filter((course) => (
        Number(course.totalVideos || 0) > 0
          ? Number(course.completedCount || 0) >= Number(course.totalVideos || 0)
          : Number(course.progressPercent || 0) >= 100
      )).length;

      return {
        ...user,
        progressCourses: userProgress,
        progressSummary: {
          totalCourses: userProgress.length,
          completedCourses,
          inProgressCourses: Math.max(userProgress.length - completedCourses, 0),
          averageProgress: userProgress.length
            ? Math.round(userProgress.reduce((sum, course) => sum + Number(course.progressPercent || 0), 0) / userProgress.length)
            : 0,
        },
        watchSummary: {
          watchedMinutes,
          watchedHours: Math.round((watchedMinutes / 60) * 10) / 10,
          watchedVideos: Number(watch.watchedVideos || 0),
          completedVideos: Number(watch.completedVideos || 0),
          lastWatchedAt: watch.lastWatchedAt || null,
        },
      };
    }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/users/:id', protectAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const user = await User.findById(id).select('_id email mobileNumber fullName');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = user._id;
    const userIdString = String(user._id);
    const subscriptions = await Subscription.find({ user: userId }).select('_id');
    const subscriptionIds = subscriptions.map((subscription) => subscription._id);

    const [
      progressResult,
      courseProgressResult,
      wishlistResult,
      reviewResult,
      sessionResult,
      aiTutorResult,
      lessonNoteResult,
      notificationResult,
      orderResult,
      subscriptionEventResult,
      subscriptionResult,
      contactResult,
    ] = await Promise.all([
      Progress.deleteMany({ user: userId }),
      CourseProgress.deleteMany({ userId: userIdString }),
      Wishlist.deleteMany({ user: userId }),
      Review.deleteMany({ user: userId }),
      Session.deleteMany({ user: userId }),
      AiTutorSession.deleteMany({ user: userId }),
      LessonNote.deleteMany({ user: userId }),
      Notification.deleteMany({ recipient: userId }),
      Order.deleteMany({ user: userId }),
      SubscriptionEvent.deleteMany({
        $or: [
          { user: userId },
          { subscription: { $in: subscriptionIds } },
        ],
      }),
      Subscription.deleteMany({ user: userId }),
      ContactEnquiry.deleteMany({ userId }),
    ]);

    await User.deleteOne({ _id: userId });

    res.json({
      message: 'User deleted successfully',
      deletedUser: {
        id: userIdString,
        fullName: user.fullName,
        email: user.email,
        mobileNumber: user.mobileNumber,
      },
      deletedCounts: {
        progress: progressResult.deletedCount || 0,
        courseProgress: courseProgressResult.deletedCount || 0,
        wishlists: wishlistResult.deletedCount || 0,
        reviews: reviewResult.deletedCount || 0,
        sessions: sessionResult.deletedCount || 0,
        aiTutorSessions: aiTutorResult.deletedCount || 0,
        lessonNotes: lessonNoteResult.deletedCount || 0,
        notifications: notificationResult.deletedCount || 0,
        orders: orderResult.deletedCount || 0,
        subscriptionEvents: subscriptionEventResult.deletedCount || 0,
        subscriptions: subscriptionResult.deletedCount || 0,
        contactEnquiries: contactResult.deletedCount || 0,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Users Routes
app.get('/api/users', protectAdmin, async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', protectAdmin, async (req, res) => {
  try {
    const user = new User(req.body);
    const savedUser = await user.save();
    res.status(201).json(savedUser);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Categories Routes
app.get('/api/categories', async (req, res) => {
  try {
    const cached = await getCachedPublicRead('categories');
    if (cached) {
      setPublicReadCacheHeaders(res, true);
      return res.json(cached);
    }

    const categories = await Category.find()
      .sort({ name: 1 })
      .lean();

    await setCachedPublicRead('categories', categories);
    setPublicReadCacheHeaders(res, false);
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/categories', protectAdmin, async (req, res) => {
  try {
    const category = new Category(req.body);
    const savedCategory = await category.save();
    await clearPublicReadCache();
    res.status(201).json(savedCategory);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'A category with this name already exists' });
    }

    res.status(400).json({ error: error.message });
  }
});

// Recommendation Routes
app.get('/api/recommendations/courses', async (req, res) => {
  try {
    const limit = clampRecommendationLimit(req.query.limit);
    const user = await findOptionalRecommendationUser(req);
    const cacheKey = `recommendations:anonymous:${limit}`;

    if (!user) {
      const cached = await getCachedPublicRead(cacheKey);
      if (cached) {
        setPublicReadCacheHeaders(res, true);
        return res.json(cached);
      }
    }

    const [signals, candidates] = await Promise.all([
      loadRecommendationSignals(user),
      getPublishedRecommendationCandidates(),
    ]);

    const recommendations = rankRecommendationCandidates(candidates, signals, limit);
    const response = {
      recommendations,
      meta: {
        personalized: Boolean(user && signals.categoryWeights.size),
        generatedAt: new Date().toISOString(),
        limit,
      },
    };

    if (!user) {
      await setCachedPublicRead(cacheKey, response);
      setPublicReadCacheHeaders(res, false);
    } else {
      res.set('Cache-Control', 'private, max-age=60');
    }

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Courses Routes
app.get('/api/courses/checkout-summary', async (req, res) => {
  try {
    const { courseId } = req.query;
    const cacheKey = courseId ? `course:${courseId}` : 'featured';
    const cached = await getCachedCheckoutSummary(cacheKey);

    if (cached) {
      setCheckoutSummaryCacheHeaders(res, true);
      return res.json(cached);
    }

    const match = { status: 'published' };

    if (courseId) {
      if (!mongoose.Types.ObjectId.isValid(courseId)) {
        return res.status(400).json({ error: 'Invalid course id' });
      }
      match._id = new mongoose.Types.ObjectId(courseId);
    }

    const [course] = await Course.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      { $limit: 1 },
      {
        $lookup: {
          from: 'categories',
          localField: 'category',
          foreignField: '_id',
          as: 'category',
        },
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          title: 1,
          description: 1,
          category: { _id: '$category._id', name: '$category.name' },
          thumbnail: 1,
          thumbnailHorizontal: 1,
          thumbnailVertical: 1,
          thumbnailUrl: 1,
          thumbnailVerticalUrl: 1,
          averageRating: 1,
          instructor: 1,
          videoCount: { $size: { $ifNull: ['$videos', []] } },
          videos: { $slice: ['$videos', 1] },
        },
      },
    ]);

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    await setCachedCheckoutSummary(cacheKey, course);

    setCheckoutSummaryCacheHeaders(res, false);
    res.json(course);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/courses', async (req, res) => {
  try {
    const cached = await getCachedPublicRead('courses:published:list');
    if (cached) {
      setPublicReadCacheHeaders(res, true);
      return res.json(cached);
    }

    const courses = await Course.find({ status: 'published' })
      .select('title slug description category thumbnailUrl thumbnailVerticalUrl averageRating totalWishlisted totalStarted totalCompleted completionRate publishedAt createdAt')
      .populate('category', 'name slug isActive')
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(100)
      .lean();

    await setCachedPublicRead('courses:published:list', courses);
    setPublicReadCacheHeaders(res, false);
    res.json(courses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/courses', protectAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.body.category)) {
      return res.status(400).json({ error: 'Please select a valid category' });
    }

    if (!Array.isArray(req.body.videos) || req.body.videos.length === 0) {
      return res.status(400).json({ error: 'At least one video is required' });
    }

    const sanitizedVideos = sanitizeCourseVideos(req.body.videos);

    if (!sanitizedVideos) {
      return res.status(400).json({ error: 'Every video must include a valid Bunny Stream URL' });
    }

    const courseThumbnailUrl = sanitizeOptionalUrl(req.body.thumbnailUrl || req.body.thumbnailHorizontalUrl);
    const courseThumbnailVerticalUrl = sanitizeOptionalUrl(req.body.thumbnailVerticalUrl);

const course = new Course({
       title: req.body.title,
       slug: req.body.slug,
       description: req.body.description,
       thumbnail: null,
       thumbnailHorizontal: null,
       thumbnailVertical: null,
       thumbnailUrl: courseThumbnailUrl,
       thumbnailVerticalUrl: courseThumbnailVerticalUrl,
       videos: applyCourseThumbnailToVideos(sanitizedVideos, null, courseThumbnailUrl),
       notesUrl: req.body.notesUrl || null,
       category: req.body.category,
       status: req.body.status || 'draft',
    });
    const savedCourse = await course.save();
    await clearPublicCourseCaches();
    res.status(201).json(savedCourse);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'A course with this slug already exists' });
    }

    if (error.name === 'ValidationError') {
      const details = Object.values(error.errors).map((fieldError) => fieldError.message);
      return res.status(400).json({ error: details.join(', ') });
    }

    if (
      error.name === 'BSONError'
      || error.code === 10334
      || /out of range|BSONObj size|object to insert too large/i.test(error.message)
    ) {
      return res.status(413).json({
        error: 'Course is too large to save. Use fewer videos or shorter text fields.',
      });
    }

    res.status(400).json({ error: error.message });
  }
});

app.get('/api/admin/courses', protectAdmin, async (req, res) => {
  try {
    const courses = await Course.find()
      .populate('category', 'name slug isActive')
      .sort({ createdAt: -1 })
      .lean();

    res.json(courses.map((course) => ({
      ...course,
      videoCount: Array.isArray(course.videos) ? course.videos.length : 0,
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/admin/courses/:id', protectAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid course id' });
    }

    const existingCourse = await Course.findById(req.params.id).select('thumbnail thumbnailHorizontal thumbnailVertical thumbnailUrl thumbnailVerticalUrl');
    if (!existingCourse) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const updates = {};
    const stringFields = ['title', 'slug', 'description', 'notesUrl', 'thumbnailUrl', 'thumbnailVerticalUrl'];

    stringFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates[field] = String(req.body[field] || '').trim() || null;
      }
    });

    if (updates.title === null) {
      return res.status(400).json({ error: 'Course title is required' });
    }

    if (updates.slug === null) {
      return res.status(400).json({ error: 'Course slug is required' });
    }

    if (updates.description === null) {
      return res.status(400).json({ error: 'Course description is required' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'category')) {
      if (!mongoose.Types.ObjectId.isValid(req.body.category)) {
        return res.status(400).json({ error: 'Please select a valid category' });
      }
      updates.category = req.body.category;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
      const status = String(req.body.status || '').trim();
      if (!['draft', 'published'].includes(status)) {
        return res.status(400).json({ error: 'Invalid course status' });
      }
      updates.status = status;
      updates.publishedAt = status === 'published' ? new Date() : null;
    }

    if (
      Object.prototype.hasOwnProperty.call(req.body, 'thumbnailUrl')
      || Object.prototype.hasOwnProperty.call(req.body, 'thumbnailHorizontalUrl')
    ) {
      updates.thumbnailUrl = sanitizeOptionalUrl(req.body.thumbnailUrl || req.body.thumbnailHorizontalUrl);
      updates.thumbnail = null;
      updates.thumbnailHorizontal = null;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'thumbnailVerticalUrl')) {
      updates.thumbnailVerticalUrl = sanitizeOptionalUrl(req.body.thumbnailVerticalUrl);
      updates.thumbnailVertical = null;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'videos')) {
      const sanitizedVideos = sanitizeCourseVideos(req.body.videos);
      if (!sanitizedVideos) {
        return res.status(400).json({ error: 'Every video must include a valid Bunny Stream URL' });
      }
      updates.videos = applyCourseThumbnailToVideos(
        sanitizedVideos,
        null,
        Object.prototype.hasOwnProperty.call(updates, 'thumbnailUrl') ? updates.thumbnailUrl : existingCourse.thumbnailUrl
      );
    }

    const course = await Course.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).populate('category', 'name slug isActive');

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    await clearPublicCourseCaches();
    res.json({
      ...course.toObject(),
      videoCount: course.videos?.length || 0,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'A course with this slug already exists' });
    }

    if (error.name === 'ValidationError') {
      const details = Object.values(error.errors).map((fieldError) => fieldError.message);
      return res.status(400).json({ error: details.join(', ') });
    }

    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/admin/courses/:id', protectAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid course id' });
    }

    const courseId = req.params.id;
    const course = await Course.findById(courseId).select('title');
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const courseIdString = String(courseId);
    const lessons = await Lesson.find({ course: courseId }).select('_id').lean();
    const lessonIds = lessons.map((lesson) => lesson._id);
    const [
      lessonResult,
      progressResult,
      courseProgressResult,
      reviewResult,
      wishlistResult,
      aiTutorResult,
      lessonNoteResult,
    ] = await Promise.all([
      Lesson.deleteMany({ course: courseId }),
      Progress.deleteMany({ course: courseId }),
      CourseProgress.deleteMany({ courseId: courseIdString }),
      Review.deleteMany({ course: courseId }),
      Wishlist.updateMany({ courses: courseId }, { $pull: { courses: courseId } }),
      AiTutorSession.deleteMany({ course: courseId }),
      LessonNote.deleteMany({ lesson: { $in: lessonIds } }),
    ]);

    await Course.deleteOne({ _id: courseId });
    await clearPublicCourseCaches();

    res.json({
      message: 'Course deleted successfully',
      deletedCourse: {
        id: courseIdString,
        title: course.title,
      },
      deletedCounts: {
        lessons: lessonResult.deletedCount || 0,
        progress: progressResult.deletedCount || 0,
        courseProgress: courseProgressResult.deletedCount || 0,
        reviews: reviewResult.deletedCount || 0,
        wishlistsUpdated: wishlistResult.modifiedCount || 0,
        aiTutorSessions: aiTutorResult.deletedCount || 0,
        lessonNotes: lessonNoteResult.deletedCount || 0,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Wishlist Routes
app.get('/api/wishlist', protect, async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user._id }).select('courses');
    res.json({
      courses: wishlist?.courses || [],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wishlist', protect, async (req, res) => {
  try {
    const { courseId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ error: 'Please select a valid course' });
    }

    const existingCourse = await Course.findById(courseId).select('_id');
    if (!existingCourse) {
      return res.status(404).json({ error: 'Course not found' });
    }

    let wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) {
      wishlist = await Wishlist.create({ user: req.user._id, courses: [] });
    }

    const alreadyWishlisted = wishlist.courses.some((id) => String(id) === String(courseId));
    if (!alreadyWishlisted) {
      wishlist.courses.push(courseId);
      await Promise.all([
        wishlist.save(),
        Course.findByIdAndUpdate(courseId, { $inc: { totalWishlisted: 1 } }),
      ]);
    }

    res.json({
      wishlisted: true,
      courses: wishlist.courses,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/wishlist', protect, async (req, res) => {
  try {
    const { courseId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ error: 'Please select a valid course' });
    }

    const wishlist = await Wishlist.findOne({ user: req.user._id });
    const alreadyWishlisted = wishlist?.courses?.some((id) => String(id) === String(courseId));

    if (wishlist && alreadyWishlisted) {
      wishlist.courses = wishlist.courses.filter((id) => String(id) !== String(courseId));
      await Promise.all([
        wishlist.save(),
        Course.findByIdAndUpdate(courseId, { $inc: { totalWishlisted: -1 } }),
      ]);
    }

    res.json({
      wishlisted: false,
      courses: wishlist?.courses || [],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wishlist/toggle', protect, async (req, res) => {
  try {
    const { courseId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ error: 'Please select a valid course' });
    }

    const existingCourse = await Course.findById(courseId).select('_id');
    if (!existingCourse) {
      return res.status(404).json({ error: 'Course not found' });
    }

    let wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) {
      wishlist = await Wishlist.create({ user: req.user._id, courses: [] });
    }

    const alreadyWishlisted = wishlist.courses.some((id) => String(id) === String(courseId));

    if (alreadyWishlisted) {
      wishlist.courses = wishlist.courses.filter((id) => String(id) !== String(courseId));
      await Course.findByIdAndUpdate(courseId, { $inc: { totalWishlisted: -1 } });
    } else {
      wishlist.courses.push(courseId);
      await Course.findByIdAndUpdate(courseId, { $inc: { totalWishlisted: 1 } });
    }

    await wishlist.save();

    res.json({
      wishlisted: !alreadyWishlisted,
      courses: wishlist.courses,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

if (SERVE_FRONTEND) {
  app.get(/^\/(?!api\/).*/, (req, res) => {
    return res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`EduNex API listening on port ${PORT}`);
});
