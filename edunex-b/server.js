if (process.env.SKILLOMATE_CONFIG_SOURCE === 'ssm'
  && globalThis[Symbol.for('skillomate.ssm.bootstrap')] !== true) {
  console.error('SSM_CONFIG_STARTUP_FAILURE: BootstrapRequired');
  process.exit(1);
}

const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const path = require('path');
const fs = require('fs');
if (process.env.SKILLOMATE_CONFIG_SOURCE !== 'ssm') {
  const initialNodeEnv = process.env.NODE_ENV;
  require('dotenv').config({ path: path.join(__dirname, '.env') });
  if (initialNodeEnv !== 'production') {
    require('dotenv').config({ path: path.join(__dirname, '.env.local'), override: true });
  }
}
const helmet = require('helmet');
const { getMongoConnectionOptions } = require('./config/mongodb');
const { ALLOWED_ORIGINS, skillomateCors } = require('./middleware/cors');
const { createReadinessHandler } = require('./services/readinessService');
const { frontendCacheControl, inlineScriptCspHash } = require('./services/frontendAssets');
const {
  assertSourceSize,
  imageVariantFromQuery,
  optimizeImageBuffer,
} = require('./services/imageProxy');
const { auditPaymentOrder, duplicatePaymentReferences, paymentReference } = require('./services/paymentAuditService');
const { normalizeLessonNotes } = require('./services/lessonNotes');
const {
  areRateLimitsDisabled,
  canDisableRateLimitsInProduction,
  isAuthRateLimitDisabled,
} = require('./services/rateLimitToggle');
const app = express();
app.disable('x-powered-by');
app.use(skillomateCors);

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
const THEME_PRELOAD_CSP_HASH = inlineScriptCspHash(
  path.join(FRONTEND_DIR, 'index.html'),
  'skillomate-theme-preload',
);
const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, 'uploads');
const COURSE_THUMBNAIL_UPLOAD_DIR = path.join(UPLOADS_DIR, 'course-thumbnails');
const isProduction = process.env.NODE_ENV === 'production';
const SERVE_FRONTEND = process.env.SERVE_FRONTEND !== 'false' && fs.existsSync(FRONTEND_DIR);
const MONGODB_URI = process.env.MONGODB_URI || (isProduction ? '' : 'mongodb://localhost:27017/edunex');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (isProduction ? '' : 'Sdbc@123');
const ADMIN_TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || (isProduction ? '' : 'edunex-development-admin-secret');
const ACCESS_TOKEN_SECRET = process.env.JWT_SECRET || (isProduction ? '' : 'edunex-development-access-secret');
const PRODUCTION_FRONTEND_ORIGINS = [...ALLOWED_ORIGINS];
const CONFIGURED_FRONTEND_ORIGINS = [process.env.FRONTEND_ORIGIN, process.env.FRONTEND_ORIGINS]
  .filter(Boolean)
  .join(',')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const FRONTEND_ORIGINS = [...new Set([
  ...CONFIGURED_FRONTEND_ORIGINS,
  ...(isProduction ? PRODUCTION_FRONTEND_ORIGINS : []),
])];
const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE || '';
const BUNNY_STORAGE_REGION = process.env.BUNNY_STORAGE_REGION || '';
const BUNNY_STORAGE_ACCESS_KEY = process.env.BUNNY_STORAGE_ACCESS_KEY || '';
const BUNNY_PULL_ZONE_URL = process.env.BUNNY_PULL_ZONE_URL
  || (process.env.BUNNY_STREAM_CDN_HOSTNAME ? `https://${process.env.BUNNY_STREAM_CDN_HOSTNAME}/` : '')
  || 'https://edunex.b-cdn.net/';
const BUNNY_STREAM_LIBRARY_ID = process.env.BUNNY_STREAM_LIBRARY_ID || '';
const BUNNY_STREAM_API_KEY = process.env.BUNNY_STREAM_API_KEY || '';
const OTP_PROVIDER = String(process.env.OTP_PROVIDER || process.env.OTP_DELIVERY_PROVIDER || '').trim().toLowerCase();
const PAYMENT_GATEWAY_MODE = String(process.env.PAYMENT_GATEWAY_MODE || '').trim().toLowerCase();
const AD_PAYMENT_MODE = String(process.env.AD_PAYMENT_MODE || '').trim().toLowerCase();
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
  'ACCOUNT_DELETION_HASH_SECRET',
  'AD_PAYMENT_MODE',
  'APPLE_BUNDLE_ID',
  'APPLE_APP_ID',
  'APPLE_IAP_ISSUER_ID',
  'APPLE_IAP_KEY_ID',
  'APPLE_IAP_PRIVATE_KEY',
]);

if (process.env.APPLE_SUBSCRIPTION_PRODUCT_ID && process.env.APPLE_SUBSCRIPTION_PRODUCT_ID !== 'com.skillomate.premium.monthly') {
  console.error('APPLE_SUBSCRIPTION_PRODUCT_ID must be com.skillomate.premium.monthly.');
  process.exit(1);
}

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

if (isProduction && !['test', 'live'].includes(AD_PAYMENT_MODE)) {
  console.error('AD_PAYMENT_MODE must be test or live in production.');
  process.exit(1);
}

if (isProduction && isAuthRateLimitDisabled() && !canDisableRateLimitsInProduction()) {
  console.error('Rate limit disabling env vars require ALLOW_RATE_LIMIT_DISABLE_IN_PRODUCTION=true in production.');
  process.exit(1);
}

// Import models
const User = require('./models/User');
const Category = require('./models/Category');
const Course = require('./models/Course');
const Subscription = require('./models/Subscription');
const RazorpayBilling = require('./models/RazorpayBilling');
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
const Certificate = require('./models/Certificate');
const AdminUserAction = require('./models/AdminUserAction');
const Session = require('./models/Session');
const featureSettings = require('./services/adminFeatureSettings');
const { resolveSubscriptionAccess: resolveAdminSubscriptionAccess } = require('./services/subscriptionAccess');
const { presenceFromPing } = require('./services/userPresence');
const { saveThumbnailUpload } = require('./services/thumbnailStorage');
const { getClarityDashboardInsights } = require('./services/clarityInsights');

// Import routes
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payment');
const sessionRoutes = require('./routes/sessions');
const contentRoutes = require('./routes/content');
const aiRoutes = require('./routes/ai');
const mobileCompatRoutes = require('./routes/mobileCompat');
const problemReportRoutes = require('./routes/problemReports');
const { protect } = require('./middleware/auth');
const {
  clearCacheNamespace,
  getCacheBackend,
  getJsonCache,
  getSharedRedisClient,
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
      scriptSrc: ["'self'", ...(THEME_PRELOAD_CSP_HASH ? [THEME_PRELOAD_CSP_HASH] : []), 'https://checkout.razorpay.com'],
      frameSrc: ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      workerSrc: ["'self'", 'blob:'],
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
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
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
    return 'Highly rated by Skillomate learners';
  }

  if (Number(course.totalStarted || 0) > 0) {
    return 'Trending in the current catalog';
  }

  return 'New from the Skillomate catalog';
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
    const isActive = Boolean(sessionId) && String(user.activeSessionId || '') === String(sessionId);

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
  if (areRateLimitsDisabled()) {
    return { key: getClientIp(req), blockedSeconds: 0, state: { count: 0, firstAttemptAt: Date.now(), blockedUntil: 0 } };
  }

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
  if (areRateLimitsDisabled()) return;

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

const { protectAdmin } = require('./middleware/adminAuth');

app.use('/api/webhooks/razorpay', express.raw({ type: '*/*', limit: '2mb' }));
app.use('/api/webhooks/phonepe', express.raw({ type: '*/*', limit: '2mb' }));
app.post('/api/admin/extract-pdf-notes', protectAdmin, express.raw({ type: 'application/pdf', limit: '10mb' }), async (req, res) => {
  try {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Choose a PDF file to extract.' });
    const result = await require('./services/pdfTextExtraction').extractPdfText(req.body);
    req.body.fill(0);
    res.json(result);
  } catch (error) {
    if (Buffer.isBuffer(req.body)) req.body.fill(0);
    res.status(error.statusCode || 500).json({ error: error.message || 'Could not extract text from this PDF.' });
  }
});
app.use((req, res, next) => {
  if (['/api/webhooks/phonepe', '/api/webhooks/razorpay'].includes(req.path)) {
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
app.use('/uploads', express.static(UPLOADS_DIR, {
  maxAge: '7d',
  immutable: true,
}));
app.use('/uploads', (req, res) => res.sendStatus(404));
if (SERVE_FRONTEND) {
  app.use(express.static(FRONTEND_DIR, {
    setHeaders(res, filePath) {
      const cacheControl = frontendCacheControl(filePath, FRONTEND_DIR);
      if (cacheControl) res.setHeader('Cache-Control', cacheControl);
    },
  }));
}

// MongoDB Connection
if (!/^mongodb(\+srv)?:\/\//.test(MONGODB_URI)) {
  console.error('❌ MongoDB connection error: MONGODB_URI must start with mongodb:// or mongodb+srv://');
} else {
  mongoose.connect(MONGODB_URI, getMongoConnectionOptions()).then(() => {
    console.log('✅ MongoDB connected');
    if (process.env.DISABLE_BACKGROUND_JOBS !== 'true') {
      require('./jobs/courseStatsJob');
      require('./jobs/subscriptionTasks');
      require('./jobs/billingCancellationTasks');
    }
  }).catch((err) => {
    const safeCode = typeof err?.code === 'string' && /^[A-Z0-9_]+$/.test(err.code)
      ? ` (${err.code})`
      : '';
    console.error(`❌ MongoDB connection failed${safeCode}`);
  });
}

// Root route
app.get('/', (req, res) => {
  if (SERVE_FRONTEND) {
    return res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
  }

  return res.json({ ok: true, service: 'Skillomate API' });
});

app.get(['/admin', '/admin/'], (req, res) => {
  if (SERVE_FRONTEND) {
    const legacyAdminLogin = path.join(FRONTEND_DIR, 'admin-login.html');
    if (fs.existsSync(legacyAdminLogin)) {
      return res.sendFile(legacyAdminLogin);
    }
  }

  const frontendOrigin = FRONTEND_ORIGINS[0] || '';
  const adminLoginPath = '/admin/login';
  return res.redirect(frontendOrigin ? `${frontendOrigin}${adminLoginPath}` : adminLoginPath);
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'Skillomate API',
    uptimeSeconds: Math.round(process.uptime()),
    cache: getCacheBackend(),
  });
});

app.get('/api/ready', createReadinessHandler({
  mongoose,
  getSharedRedisClient,
}));

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
  const normalized = String(value || '').trim();
  if (!normalized) return null;

  if (/^https?:\/\/(?:www\.)?drive\.google\.com\//i.test(normalized)) {
    const pathMatch = normalized.match(/\/(?:file\/)?d\/([a-zA-Z0-9_-]+)/i);
    const queryMatch = normalized.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
    const driveFileId = pathMatch?.[1] || queryMatch?.[1];
    if (driveFileId) {
      return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveFileId)}&sz=w1600`;
    }
  }

  return normalized;
}

function sanitizeCourseThumbnailUrl(value) {
  const normalized = sanitizeOptionalUrl(value);
  if (!normalized || !isProduction) return normalized;

  try {
    const url = new URL(normalized);
    const hostname = url.hostname.toLowerCase();
    const localOrInstanceHost = hostname === 'localhost'
      || hostname.endsWith('.local')
      || net.isIP(hostname) !== 0
      || /^ec2-[a-z0-9-]+\.compute(?:-[0-9]+)?\.amazonaws\.com$/i.test(hostname);
    if (url.protocol !== 'https:' || url.username || url.password || localOrInstanceHost) throw new Error('unsafe');
    return url.href;
  } catch {
    const error = new Error('Course thumbnail URL must use shared HTTPS storage.');
    error.statusCode = 400;
    throw error;
  }
}

const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;
const ALLOWED_THUMBNAIL_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function hasStoredThumbnail(image) {
  return Boolean(image?.mimeType && ALLOWED_THUMBNAIL_TYPES.has(image.mimeType));
}

function isLocalThumbnailUrl(value) {
  return /^\/uploads\/course-thumbnails\/[a-f0-9]{24}-(?:horizontal|vertical)\.(?:jpg|png|webp)$/i.test(String(value || ''));
}

function localThumbnailFileExists(value) {
  if (!isLocalThumbnailUrl(value)) return false;
  return fs.existsSync(path.join(COURSE_THUMBNAIL_UPLOAD_DIR, path.basename(value)));
}

function storedThumbnailUrl(courseId, orientation = 'horizontal') {
  const id = String(courseId || '');
  if (!/^[a-f0-9]{24}$/i.test(id)) return null;

  const normalizedOrientation = orientation === 'vertical' ? 'vertical' : 'horizontal';
  for (const extension of ['webp', 'png', 'jpg']) {
    const filename = `${id}-${normalizedOrientation}.${extension}`;
    if (fs.existsSync(path.join(COURSE_THUMBNAIL_UPLOAD_DIR, filename))) {
      return `/uploads/course-thumbnails/${filename}`;
    }
  }
  return null;
}

function publicCourseThumbnailUrl(course, orientation = 'horizontal') {
  const id = course?._id;
  if (!id) return null;

  const horizontalImage = course.thumbnailHorizontal || course.thumbnail;
  const verticalImage = course.thumbnailVertical;
  const storedUrl = storedThumbnailUrl(id, orientation);

  if (orientation === 'vertical') {
    if (localThumbnailFileExists(course.thumbnailVerticalUrl)) return course.thumbnailVerticalUrl;
    if (localThumbnailFileExists(course.thumbnailUrl)) return course.thumbnailUrl;
    if (storedUrl) return storedUrl;
    if (hasStoredThumbnail(verticalImage) || hasStoredThumbnail(horizontalImage)) {
      return `/api/courses/${id}/thumbnail?orientation=vertical`;
    }
    return course.thumbnailVerticalUrl || course.thumbnailUrl || `/api/courses/${id}/thumbnail?orientation=vertical`;
  }

  if (localThumbnailFileExists(course.thumbnailUrl)) return course.thumbnailUrl;
  if (storedUrl) return storedUrl;
  if (hasStoredThumbnail(horizontalImage) || hasStoredThumbnail(verticalImage)) {
    return `/api/courses/${id}/thumbnail`;
  }
  return course.thumbnailUrl || course.thumbnailVerticalUrl || `/api/courses/${id}/thumbnail`;
}

function parseThumbnailDataUrl(value, label) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const match = raw.match(/^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=\s]+)$/i);
  if (!match) {
    const error = new Error(`${label} must be a JPEG, PNG, or WebP image.`);
    error.statusCode = 400;
    throw error;
  }

  const mimeType = match[1].toLowerCase();
  if (!ALLOWED_THUMBNAIL_TYPES.has(mimeType)) {
    const error = new Error(`${label} must be a JPEG, PNG, or WebP image.`);
    error.statusCode = 400;
    throw error;
  }

  const base64 = match[2].replace(/\s/g, '');
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length || buffer.length > MAX_THUMBNAIL_BYTES) {
    const error = new Error(`${label} must be smaller than 2 MB.`);
    error.statusCode = buffer.length > MAX_THUMBNAIL_BYTES ? 413 : 400;
    throw error;
  }

  return {
    data: buffer.toString('base64'),
    mimeType,
    originalName: label,
    size: buffer.length,
  };
}

function sanitizeCourseVideos(rawVideos, existingVideos = []) {
  if (!Array.isArray(rawVideos) || !rawVideos.length || rawVideos.length > 500) throw new Error('Provide between 1 and 500 lessons.');
  const { validateSource } = require('./services/videoSources');
  const used = new Set();
  return rawVideos.map((video, index) => {
    try {
      if (!video || typeof video !== 'object') throw new Error('Invalid lesson.');
      const source = validateSource(video);
      const previous = video._id ? existingVideos.find(v => String(v._id) === String(video._id)) : existingVideos.find(v => v.videoUrl === video.videoUrl && v.title === video.title);
      if (video._id && !previous) throw new Error('Lesson ID does not belong to this course.');
      const id = previous?._id || new mongoose.Types.ObjectId();
      if (used.has(String(id))) throw new Error('Duplicate lesson ID.');
      used.add(String(id));
      const duration = Number(video.duration || 0);
      if (!Number.isFinite(duration) || duration < 0) throw new Error('Duration must be a positive number of seconds.');
      return { _id: id, ...source, title: String(video.title || '').trim(), topic: String(video.topic || '').trim(), description: String(video.description || '').trim(), notes: String(video.notes || '').trim(), duration, order: index + 1,
        transcriptUrl: video.transcriptUrl || previous?.transcriptUrl || null, thumbnail: previous?.thumbnail || {},
        notesUrl: sanitizeOptionalUrl(video.notesUrl), thumbnailUrl: sanitizeOptionalUrl(video.thumbnailUrl), thumbnailVerticalUrl: sanitizeOptionalUrl(video.thumbnailVerticalUrl), examplePrompt: String(video.examplePrompt || '').trim() };
    } catch (error) { throw new Error(`Lesson ${index + 1}: ${error.message}`); }
  });
}

function applyCourseThumbnailToVideos(videos, courseThumbnail, courseThumbnailUrl, courseThumbnailVerticalUrl) {
  const sharedThumbnailUrl = sanitizeOptionalUrl(courseThumbnailUrl);
  const sharedThumbnailVerticalUrl = sanitizeOptionalUrl(courseThumbnailVerticalUrl);

  return (Array.isArray(videos) ? videos : []).map((video) => ({
    ...video,
    thumbnail: video.thumbnail || null,
    thumbnailUrl: sanitizeOptionalUrl(video.thumbnailUrl) || sharedThumbnailUrl,
    thumbnailVerticalUrl: sanitizeOptionalUrl(video.thumbnailVerticalUrl) || sharedThumbnailVerticalUrl,
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
        error: 'Bunny Stream is not configured.',
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

app.post('/api/admin/login', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const rateState = getAdminLoginRateState(req);
  if (rateState.blockedSeconds) return res.status(429).json({ error: `Too many login attempts. Try again in ${rateState.blockedSeconds} seconds.` });
  try {
    const result = await require('./services/adminIdentity').login(req.body.username, req.body.password);
    clearAdminLoginRate(rateState.key);
    res.json(result);
  } catch (error) {
    if (error.statusCode === 401) recordAdminLoginFailure(rateState.key, rateState.state);
    res.status(error.statusCode || 503).json({ error: error.statusCode ? error.message : 'Workspace login is temporarily unavailable.' });
  }
});
app.use('/api/admin', require('./routes/adminAccounts'));

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

function googleDriveImageId(target) {
  const hostname = String(target.hostname || '').toLowerCase();
  if (!/(^|\.)drive\.google\.com$/.test(hostname)) return '';

  const fileMatch = target.pathname.match(/\/file\/d\/([^/]+)/);
  return fileMatch?.[1] || target.searchParams.get('id') || '';
}

function normalizeProxyImageTarget(target, requestedWidth = 0) {
  const driveId = googleDriveImageId(target);
  if (!driveId) return target;

  const width = requestedWidth || 1200;
  return new URL(`https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w${width}`);
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
  let variant;

  try {
    variant = imageVariantFromQuery(req.query);
    target = new URL(rawUrl);
    target = normalizeProxyImageTarget(target, variant.width);
  } catch (error) {
    return res.status(error.statusCode || 400).send(error.statusCode ? error.message : 'Invalid image URL');
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
        'User-Agent': 'Skillomate image proxy',
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

    assertSourceSize(upstream.headers.get('content-length'));
    const imageBuffer = Buffer.from(await upstream.arrayBuffer());
    assertSourceSize(0, imageBuffer.length);
    const image = await optimizeImageBuffer(imageBuffer, contentType, variant);
    res.set('Content-Type', image.contentType);
    res.set('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=31536000');
    return res.send(image.buffer);
  } catch (error) {
    clearTimeout(timeout);
    return res.status(error.statusCode || 502).send(error.statusCode ? error.message : 'Could not fetch image');
  }
});

// Auth Routes
app.use('/api', (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: 'Database is not connected.',
    });
  }

  next();
});

app.use('/api', require('./routes/deletionRequests'));
app.use('/api', require('./routes/playback'));
app.use('/api', require('./routes/certification'));
app.use('/api', problemReportRoutes);
app.use('/api/admin', require('./routes/adminHealth'));
app.use('/api/admin', require('./routes/paymentSettings'));
app.use('/api', require('./routes/marketingSettings'));
app.use('/api/auth', authRoutes);
app.use('/api/onboarding', require('./routes/onboarding'));
app.use('/api/ai', aiRoutes);
app.use('/api', require('./routes/appleIap'));
app.use('/api', require('./routes/googlePlayIap'));
app.use('/api', paymentRoutes);
app.use('/api', sessionRoutes);
app.use('/api', require('./routes/notifications'));
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

app.get('/api/admin/payment-audit', protectAdmin, async (req, res) => {
  try {
    const limit = Math.min(500, Math.max(25, Number.parseInt(req.query.limit, 10) || 250));
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('user', 'fullName email mobileNumber subscriptionStatus')
      .populate('subscription', 'status subscriptionType currentPeriodEnd gateway')
      .lean();
    const duplicateReferences = duplicatePaymentReferences(orders);
    const records = orders.map((order) => {
      const audit = auditPaymentOrder(order, { duplicateReferences });
      return {
        _id: order._id,
        orderId: order.phonePeMerchantTransactionId,
        providerReference: paymentReference(order),
        gateway: order.gateway || 'phonepe',
        gatewayMode: order.razorpayMode || null,
        orderType: order.orderType,
        status: order.status,
        totalAmount: order.totalAmount,
        refundedAmount: order.refundedAmount || 0,
        paymentInstrument: order.phonePePaymentInstrument || null,
        paidAt: order.paidAt,
        createdAt: order.createdAt,
        user: order.user,
        subscription: order.subscription,
        ...audit,
      };
    });
    const flagged = records.filter((record) => record.risk !== 'clear');
    res.json({
      generatedAt: new Date(),
      scanned: records.length,
      limited: records.length === limit,
      summary: {
        clear: records.filter((record) => record.risk === 'clear').length,
        warning: records.filter((record) => record.risk === 'warning').length,
        critical: records.filter((record) => record.risk === 'critical').length,
        flagged: flagged.length,
        stalePending: records.filter((record) => record.issues.some((issue) => issue.code === 'stale_pending')).length,
        duplicateReferences: duplicateReferences.size,
      },
      records,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/analytics', protectAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = getAnalyticsRange(req.query);
    const rangeFilter = { $gte: startDate, $lte: endDate };
    const rangeStartKey = formatDateKey(startDate);
    const rangeEndKey = formatDateKey(endDate);
    const testerUsers = await User.find({ isTester: true }).select('_id').lean();
    const testerObjectIds = testerUsers.map((user) => user._id);
    const testerIds = testerObjectIds.map(String);
    const learnerFilter = { isTester: { $ne: true } };
    const learnerRangeFilter = { ...learnerFilter, createdAt: rangeFilter };
    const testerUserExclusion = testerObjectIds.length ? { user: { $nin: testerObjectIds } } : {};
    const testerUserIdExclusion = testerIds.length ? { userId: { $nin: testerIds } } : {};
    const analyticsEventFilter = {
      event: { $in: ['video_start', 'video_progress', 'video_complete', 'video_watch'] },
      ...testerUserIdExclusion,
      $or: [
        { date: { $gte: rangeStartKey, $lte: rangeEndKey } },
        { createdAt: rangeFilter },
      ],
    };
    const analyticsDownloadFilter = {
      event: 'video_download',
      ...testerUserIdExclusion,
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
      autoPayActiveSubscriptions,
      cancelledMandates,
      renewalPendingSubscriptions,
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
      User.countDocuments(learnerFilter),
      User.countDocuments({ ...learnerFilter, isActive: true }),
      User.countDocuments({ ...learnerFilter, isActive: false }),
      User.countDocuments({ ...learnerFilter, isMobileVerified: true }),
      User.countDocuments({ ...learnerFilter, isEmailVerified: true }),
      User.countDocuments({ ...learnerFilter, marketingOptIn: true }),
      Course.countDocuments(),
      Course.countDocuments({ status: 'published' }),
      Course.countDocuments({ status: 'draft' }),
      Lesson.countDocuments(),
      Lesson.countDocuments({ isPreview: true }),
      Review.countDocuments(),
      Wishlist.countDocuments(),
      Subscription.countDocuments(testerUserExclusion),
      Subscription.countDocuments({ ...testerUserExclusion, status: { $in: subscriberStatuses } }),
      Subscription.countDocuments({ ...testerUserExclusion, status: { $in: trialStatuses } }),
      User.countDocuments({ ...learnerFilter, subscriptionStatus: '1rs trial' }),
      User.countDocuments({ ...learnerFilter, subscriptionStatus: 'trial' }),
      User.countDocuments({ ...learnerFilter, subscriptionStatus: { $in: subscriberStatuses } }),
      User.countDocuments({
        ...learnerFilter,
        $or: [
          { subscriptionStatus: 'none' },
          { subscriptionStatus: null },
          { subscriptionStatus: { $exists: false } },
        ],
      }),
      User.countDocuments({ ...learnerFilter, subscriptionStatus: 'cancelled' }),
      User.countDocuments({ ...learnerFilter, subscriptionStatus: 'expired' }),
      Subscription.countDocuments({ ...testerUserExclusion, status: 'paused' }),
      Subscription.countDocuments({
        ...testerUserExclusion,
        cancelledAt: null,
        $or: [
          { phonePeMandateId: { $nin: [null, ''] } },
          { razorpaySubscriptionId: { $nin: [null, ''] }, razorpayStatus: { $nin: ['cancelled', 'expired', 'halted', 'paused'] } },
        ],
      }),
      Subscription.countDocuments({
        ...testerUserExclusion,
        $or: [
          { cancelledAt: { $ne: null } },
          { status: 'cancelled' },
          { razorpayStatus: 'cancelled' },
        ],
      }),
      Subscription.countDocuments({
        ...testerUserExclusion,
        status: { $in: trialStatuses },
        trialExpiresAt: { $lte: new Date() },
        $or: [
          { currentPeriodEnd: null },
          { currentPeriodEnd: { $exists: false } },
        ],
      }),
      User.countDocuments({
        ...learnerFilter,
        $or: [
          { subscriptionId: null },
          { subscriptionId: { $exists: false } },
        ],
      }),
      User.countDocuments(learnerRangeFilter),
      Subscription.countDocuments({ ...testerUserExclusion, createdAt: rangeFilter }),
      Course.countDocuments({ createdAt: rangeFilter }),
      Order.countDocuments({ ...testerUserExclusion, createdAt: rangeFilter }),
      Order.countDocuments({ ...testerUserExclusion, status: 'paid', createdAt: rangeFilter }),
      Order.countDocuments({ ...testerUserExclusion, status: 'failed', createdAt: rangeFilter }),
      Order.countDocuments({ ...testerUserExclusion, status: 'pending', createdAt: rangeFilter }),
      Order.aggregate([
        { $match: { ...testerUserExclusion, status: 'paid', createdAt: rangeFilter } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, average: { $avg: '$totalAmount' } } },
      ]),
      Order.aggregate([
        { $match: { ...testerUserExclusion, status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      Order.aggregate([{ $match: testerUserExclusion }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Order.aggregate([{ $match: testerUserExclusion }, { $group: { _id: '$orderType', count: { $sum: 1 }, amount: { $sum: '$totalAmount' } } }]),
      Order.aggregate([{ $match: testerUserExclusion }, { $group: { _id: '$phonePePaymentInstrument', count: { $sum: 1 } } }]),
      Subscription.aggregate([{ $match: testerUserExclusion }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      User.aggregate([{ $match: learnerFilter }, { $group: { _id: '$subscriptionStatus', count: { $sum: 1 } } }]),
      User.aggregate([
        { $match: learnerFilter },
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
        { $match: learnerFilter },
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
        { $match: { ...testerUserExclusion, lastWatchedAt: rangeFilter } },
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
        { $match: { courseTitle: { $nin: [null, ''] }, ...testerUserIdExclusion } },
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
        { $match: { ...testerUserExclusion, lastWatchedAt: rangeFilter } },
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
        { $match: { ...testerUserExclusion, lastWatchedAt: rangeFilter } },
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
        { $match: { ...testerUserExclusion, lastWatchedAt: rangeFilter } },
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
        { $match: { ...testerUserExclusion, lastWatchedAt: rangeFilter } },
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
        { $match: learnerRangeFilter },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: ANALYTICS_TIMEZONE } }, count: { $sum: 1 } } },
      ]),
      Subscription.aggregate([
        { $match: { ...testerUserExclusion, createdAt: rangeFilter } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: ANALYTICS_TIMEZONE } }, count: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { ...testerUserExclusion, status: 'paid', createdAt: rangeFilter } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: ANALYTICS_TIMEZONE } }, count: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { ...testerUserExclusion, status: 'paid', createdAt: rangeFilter } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: ANALYTICS_TIMEZONE } }, total: { $sum: '$totalAmount' } } },
      ]),
      Subscription.find(testerUserExclusion)
        .sort({ createdAt: -1 })
        .limit(8)
        .populate('user', 'fullName email mobileNumber subscriptionStatus')
        .select('user gateway status subscriptionType amount trialStartedAt trialExpiresAt currentPeriodStart currentPeriodEnd nextBillingAt cancelledAt cancelReason razorpaySubscriptionId razorpayStatus phonePeSubscriptionId phonePeMandateId createdAt'),
      User.find(learnerFilter)
        .sort({ createdAt: -1 })
        .limit(8)
        .select('fullName email mobileNumber avatar gender age subscriptionStatus isMobileVerified createdAt lastActiveAt'),
      Order.find(testerUserExclusion)
        .sort({ createdAt: -1 })
        .limit(8)
        .populate('user', 'fullName email')
        .select('user totalAmount status orderType phonePePaymentInstrument paidAt createdAt'),
      SubscriptionEvent.find(testerUserExclusion)
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
    const clarityInsights = await getClarityDashboardInsights().catch((error) => ({
      configured: Boolean(process.env.CLARITY_API_TOKEN || process.env.CLARITY_DATA_EXPORT_TOKEN),
      error: error.message,
    }));
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
        autoPayActiveSubscriptions,
        cancelledMandates,
        renewalPendingSubscriptions,
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
      clarity: clarityInsights,
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

app.get('/api/admin/payments', protectAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 150, 1), 500);
    const rows = await Order.find({ status: 'paid' })
      .sort({ paidAt: -1, createdAt: -1 })
      .limit(limit)
      .populate('user', 'fullName email mobileNumber subscriptionStatus')
      .populate('subscription', 'gateway status subscriptionType amount razorpayStatus razorpaySubscriptionId phonePeSubscriptionId phonePeMandateId nextBillingAt currentPeriodStart currentPeriodEnd cancelledAt')
      .select('user subscription totalAmount gateway status orderType phonePePaymentInstrument phonePeMerchantTransactionId phonePeTransactionId razorpayPaymentId razorpaySubscriptionId refundedAmount paidAt createdAt')
      .lean();
    const orderSubscriptionIds = new Set(rows.map((order) => String(order.razorpaySubscriptionId || order.subscription?.razorpaySubscriptionId || '')).filter(Boolean));
    const paidSubscriptions = await Subscription.find({
      gateway: 'razorpay',
      status: { $in: ['active', 'subscribed'] },
      currentPeriodStart: { $ne: null },
      amount: { $gt: 0 },
    })
      .sort({ currentPeriodStart: -1 })
      .limit(limit)
      .populate('user', 'fullName email mobileNumber subscriptionStatus')
      .select('user gateway status subscriptionType amount razorpayStatus razorpaySubscriptionId nextBillingAt currentPeriodStart currentPeriodEnd cancelledAt')
      .lean();
    const syntheticRows = paidSubscriptions
      .filter((subscription) => subscription.razorpaySubscriptionId && !orderSubscriptionIds.has(String(subscription.razorpaySubscriptionId)))
      .map((subscription) => ({
        _id: `subscription-period:${subscription._id}`,
        user: subscription.user,
        subscription,
        totalAmount: subscription.amount,
        gateway: 'razorpay',
        status: 'paid',
        orderType: 'subscription_charge',
        razorpaySubscriptionId: subscription.razorpaySubscriptionId,
        paidAt: subscription.currentPeriodStart,
        createdAt: subscription.currentPeriodStart,
        ledgerSource: 'subscription_period',
      }));
    const ledgerRows = [...rows, ...syntheticRows]
      .sort((a, b) => new Date(b.paidAt || b.createdAt || 0) - new Date(a.paidAt || a.createdAt || 0))
      .slice(0, limit);
    const totalAmount = ledgerRows.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
    const autoPayRows = ledgerRows.filter((order) => order.orderType === 'subscription_charge');
    const directRows = ledgerRows.filter((order) => order.orderType !== 'subscription_charge');
    res.json({
      summary: {
        count: rows.length,
        totalAmount,
        autoPayCount: autoPayRows.length,
        autoPayAmount: autoPayRows.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0),
        directCount: directRows.length,
        directAmount: directRows.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0),
      },
      payments: ledgerRows,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/ai-chats', protectAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 300);
    const sessions = await AiTutorSession.find({})
      .sort({ lastUpdatedAt: -1 })
      .limit(limit)
      .populate('user', 'fullName email mobileNumber subscriptionStatus')
      .populate('course', 'title slug')
      .lean();
    const totalMessages = sessions.reduce((sum, session) => sum + (Array.isArray(session.messages) ? session.messages.length : 0), 0);
    const users = new Set(sessions.map((session) => String(session.user?._id || session.user || '')).filter(Boolean));
    res.json({
      summary: {
        sessions: sessions.length,
        users: users.size,
        messages: totalMessages,
      },
      sessions,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/feature-settings', protectAdmin, async (_req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await featureSettings.getSettings());
  } catch (error) {
    res.status(500).json({ error: 'Unable to load feature settings.' });
  }
});

app.put('/api/admin/feature-settings', protectAdmin, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const patch = {};
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'certificationEnabled')) patch.certificationEnabled = req.body.certificationEnabled !== false;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'progressBarEnabled')) patch.progressBarEnabled = req.body.progressBarEnabled !== false;
    res.json(await featureSettings.saveSettings(patch, req.admin));
  } catch (error) {
    res.status(500).json({ error: 'Unable to save feature settings.' });
  }
});

app.get('/api/admin/tester-analytics', protectAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = getAnalyticsRange(req.query);
    const rangeFilter = { $gte: startDate, $lte: endDate };
    const rangeStartKey = formatDateKey(startDate);
    const rangeEndKey = formatDateKey(endDate);
    const testerRows = await User.find({ isTester: true })
      .sort({ testerSince: -1, createdAt: -1 })
      .select('fullName email mobileNumber avatar subscriptionStatus isActive isTester testerSince testerAssignedBy testerNotes createdAt lastActiveAt lastLoginAt loginCount purchasedCourses')
      .lean();
    const testerObjectIds = testerRows.map((user) => user._id);
    const testerIds = testerRows.map((user) => String(user._id));
    const testerIdSet = new Set(testerIds);
    const analyticsFilter = {
      userId: { $in: testerIds },
      $or: [
        { date: { $gte: rangeStartKey, $lte: rangeEndKey } },
        { createdAt: rangeFilter },
      ],
    };
    const watchEventNames = ['video_start', 'video_progress', 'video_complete', 'video_watch'];
    const [
      activeToday,
      active7Days,
      active30Days,
      watchTotals,
      courseRows,
      aiRows,
      recentEvents,
      progressRows,
      latestActions,
    ] = await Promise.all([
      User.countDocuments({ isTester: true, lastActiveAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
      User.countDocuments({ isTester: true, lastActiveAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }),
      User.countDocuments({ isTester: true, lastActiveAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }),
      AnalyticsEvent.aggregate([
        { $match: { ...analyticsFilter, event: { $in: watchEventNames } } },
        {
          $addFields: {
            watchedSeconds: { $ifNull: ['$watchSeconds', { $ifNull: ['$watchedSeconds', '$durationSeconds'] }] },
            completedValue: { $cond: [{ $eq: ['$event', 'video_complete'] }, 1, 0] },
          },
        },
        {
          $group: {
            _id: null,
            testerIds: { $addToSet: '$userId' },
            events: { $sum: 1 },
            totalWatchSeconds: { $sum: { $ifNull: ['$watchedSeconds', 0] } },
            completions: { $sum: '$completedValue' },
          },
        },
      ]),
      AnalyticsEvent.aggregate([
        { $match: { ...analyticsFilter, event: { $in: watchEventNames } } },
        {
          $addFields: {
            watchedSeconds: { $ifNull: ['$watchSeconds', { $ifNull: ['$watchedSeconds', '$durationSeconds'] }] },
          },
        },
        {
          $group: {
            _id: { courseId: '$courseId', courseTitle: '$courseTitle' },
            testerIds: { $addToSet: '$userId' },
            events: { $sum: 1 },
            totalWatchSeconds: { $sum: { $ifNull: ['$watchedSeconds', 0] } },
            lastEventAt: { $max: '$createdAt' },
          },
        },
        {
          $project: {
            courseId: '$_id.courseId',
            title: { $ifNull: ['$_id.courseTitle', 'Unknown course'] },
            testerCount: { $size: '$testerIds' },
            events: 1,
            watchMinutes: { $round: [{ $divide: ['$totalWatchSeconds', 60] }, 1] },
            lastEventAt: 1,
          },
        },
        { $sort: { watchMinutes: -1, events: -1, testerCount: -1 } },
        { $limit: 12 },
      ]),
      AnalyticsEvent.aggregate([
        { $match: { ...analyticsFilter, event: { $in: ['ai_tutor_query', 'ai_chat', 'course_ai_query'] } } },
        { $group: { _id: '$userId', count: { $sum: 1 }, lastUsedAt: { $max: '$createdAt' } } },
        { $sort: { count: -1, lastUsedAt: -1 } },
      ]),
      AnalyticsEvent.find(analyticsFilter)
        .sort({ createdAt: -1 })
        .limit(24)
        .select('event userId userName userEmail courseId courseTitle videoTitle createdAt date')
        .lean(),
      Progress.aggregate([
        { $match: { user: { $in: testerObjectIds } } },
        {
          $group: {
            _id: '$user',
            totalWatchSeconds: { $sum: { $ifNull: ['$watchedSeconds', 0] } },
            watchedVideos: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$watchedSeconds', 0] }, 0] }, 1, 0] } },
            completedVideos: { $sum: { $cond: ['$completed', 1, 0] } },
            lastWatchedAt: { $max: '$lastWatchedAt' },
          },
        },
      ]),
      AdminUserAction.find({ user: { $in: testerObjectIds }, action: { $in: ['tester_enabled', 'tester_disabled'] } })
        .sort({ createdAt: -1 })
        .limit(20)
        .populate('user', 'fullName mobileNumber email isTester')
        .select('user action reason adminSubject previousState nextState createdAt')
        .lean(),
    ]);

    const progressByUser = new Map(progressRows.map((row) => [String(row._id), row]));
    const aiByUser = new Map(aiRows.map((row) => [String(row._id), row]));
    const watchSummary = watchTotals[0] || {};
    const testers = testerRows.map((user) => {
      const progress = progressByUser.get(String(user._id)) || {};
      const ai = aiByUser.get(String(user._id)) || {};
      return {
        ...user,
        watchSummary: {
          watchedMinutes: Math.round(Number(progress.totalWatchSeconds || 0) / 60),
          watchedVideos: Number(progress.watchedVideos || 0),
          completedVideos: Number(progress.completedVideos || 0),
          lastWatchedAt: progress.lastWatchedAt || null,
        },
        aiSummary: {
          messages: Number(ai.count || 0),
          lastUsedAt: ai.lastUsedAt || null,
        },
      };
    });

    res.json({
      range: { startDate: rangeStartKey, endDate: rangeEndKey },
      totals: {
        testers: testerRows.length,
        activeToday,
        active7Days,
        active30Days,
        activeInRange: (watchSummary.testerIds || []).filter((id) => testerIdSet.has(String(id))).length,
        watchEvents: Number(watchSummary.events || 0),
        watchMinutes: Math.round(Number(watchSummary.totalWatchSeconds || 0) / 60),
        completedVideos: Number(watchSummary.completions || 0),
        aiMessages: aiRows.reduce((sum, row) => sum + Number(row.count || 0), 0),
      },
      testers,
      courses: courseRows,
      recentEvents,
      recentActions: latestActions,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/users', protectAdmin, async (req, res) => {
  try {
    const fullName = String(req.body?.fullName || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 254) || null;
    const rawMobile = String(req.body?.mobileNumber || '').replace(/\D/g, '');
    const mobileNumber = rawMobile.length === 10 ? `91${rawMobile}` : rawMobile;
    const password = String(req.body?.password || '');
    const courseId = String(req.body?.courseId || '').trim();
    const courseAccessType = String(req.body?.courseAccessType || 'permanent').trim().toLowerCase();
    const courseAccessDays = Math.min(365, Math.max(1, Number.parseInt(req.body?.courseAccessDays, 10) || 7));
    const isTester = req.body?.isTester === true;
    const testerNotes = String(req.body?.testerNotes || '').trim().slice(0, 500);
    const adminSubject = req.admin?.sub || req.admin?.email || 'admin';

    if (fullName.length < 2) return res.status(400).json({ error: `Enter a ${isTester ? 'test account' : 'learner'} name of at least 2 characters.` });
    if (!/^\d{12,15}$/.test(mobileNumber)) return res.status(400).json({ error: 'Enter a valid mobile number including country code.' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (password.length < 8 || password.length > 72) return res.status(400).json({ error: 'Temporary password must contain 8 to 72 characters.' });
    if (courseId && !mongoose.Types.ObjectId.isValid(courseId)) return res.status(400).json({ error: 'Choose a valid course.' });
    if (courseId && !['trial', 'yearly', 'permanent'].includes(courseAccessType)) return res.status(400).json({ error: 'Choose trial, yearly, or permanent course access.' });
    if (courseId && !await Course.exists({ _id: courseId, status: 'published' })) return res.status(404).json({ error: 'Published course not found.' });

    const duplicate = await User.findOne({
      $or: [
        { mobileNumber },
        ...(email ? [{ email }] : []),
      ],
    }).select('_id mobileNumber email').lean();
    if (duplicate) return res.status(409).json({ error: 'A learner already exists with this mobile number or email.' });

    const user = await User.create({
      fullName,
      email,
      mobileNumber,
      passwordHash: await bcrypt.hash(password, 12),
      isMobileVerified: req.body?.isMobileVerified === true,
      isEmailVerified: Boolean(email && req.body?.isEmailVerified === true),
      isActive: true,
      isOnTrial: false,
      subscriptionStatus: 'none',
      subscriptionExpiry: null,
      purchasedCourses: courseId ? [courseId] : [],
      courseEntitlements: courseId ? [{
        course: courseId,
        accessType: courseAccessType,
        grantedAt: new Date(),
        expiresAt: courseAccessType === 'permanent' ? null : new Date(Date.now() + (courseAccessType === 'yearly' ? 365 : courseAccessDays) * 86400000),
      }] : [],
      isTester,
      testerSince: isTester ? new Date() : null,
      testerAssignedBy: isTester ? adminSubject : null,
      testerNotes: isTester ? (testerNotes || 'Planted test account created from admin panel') : '',
    });

    return res.status(201).json({
      message: isTester ? 'Test account created successfully.' : 'Learner ID created successfully.',
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        mobileNumber: user.mobileNumber,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionExpiry: user.subscriptionExpiry,
        purchasedCourses: user.purchasedCourses,
        courseEntitlements: user.courseEntitlements,
        isMobileVerified: user.isMobileVerified,
        isEmailVerified: user.isEmailVerified,
        isActive: user.isActive,
        isTester: user.isTester,
        testerSince: user.testerSince,
        testerAssignedBy: user.testerAssignedBy,
        testerNotes: user.testerNotes,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'An account already exists with this mobile number or email.' });
    return res.status(500).json({ error: 'Unable to create the account.' });
  }
});

app.patch('/api/admin/users/:id/courses', protectAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid user id' });
    const courseId = String(req.body?.courseId || '').trim();
    const action = String(req.body?.action || '').trim().toLowerCase();
    const accessType = String(req.body?.accessType || 'permanent').trim().toLowerCase();
    const accessDays = Math.min(365, Math.max(1, Number.parseInt(req.body?.accessDays, 10) || 7));
    const reason = String(req.body?.reason || '').trim().slice(0, 500) || null;
    if (!mongoose.Types.ObjectId.isValid(courseId)) return res.status(400).json({ error: 'Choose a valid course.' });
    if (!['grant', 'revoke'].includes(action)) return res.status(400).json({ error: 'Action must be grant or revoke.' });
    if (action === 'grant' && !['trial', 'yearly', 'permanent'].includes(accessType)) return res.status(400).json({ error: 'Choose trial, yearly, or permanent course access.' });
    if (!reason) return res.status(400).json({ error: 'A reason is required.' });
    const [user, course] = await Promise.all([
      User.findById(req.params.id),
      Course.findOne({ _id: courseId, status: 'published' }).select('_id title').lean(),
    ]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!course) return res.status(404).json({ error: 'Published course not found.' });
    const previousCourses = (user.purchasedCourses || []).map(String);
    const previousEntitlements = (user.courseEntitlements || []).map((item) => item.toObject?.() || item);
    user.courseEntitlements = (user.courseEntitlements || []).filter((item) => String(item.course) !== courseId);
    if (action === 'grant') {
      user.purchasedCourses.addToSet(course._id);
      user.courseEntitlements.push({
        course: course._id,
        accessType,
        grantedAt: new Date(),
        expiresAt: accessType === 'permanent' ? null : new Date(Date.now() + (accessType === 'yearly' ? 365 : accessDays) * 86400000),
      });
    } else user.purchasedCourses.pull(course._id);
    await user.save();
    await AdminUserAction.create({
      user: user._id,
      action: action === 'grant' ? 'course_granted' : 'course_revoked',
      reason,
      previousState: { purchasedCourses: previousCourses, courseEntitlements: previousEntitlements },
      nextState: { purchasedCourses: user.purchasedCourses.map(String), courseEntitlements: user.courseEntitlements, courseId, courseTitle: course.title, accessType },
      adminSubject: req.admin?.sub || req.admin?.email || 'admin',
    });
    res.json({
      message: `${course.title} ${action === 'grant' ? 'added to' : 'removed from'} this learner.`,
      user: { _id: user._id, purchasedCourses: user.purchasedCourses, courseEntitlements: user.courseEntitlements },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/user-management', protectAdmin, async (req, res) => {
  try {
    const audience = String(req.query?.audience || 'learners').trim().toLowerCase();
    const userFilter = audience === 'testers' ? { isTester: true } : { isTester: { $ne: true } };
    const normalizeAdminIdentityEmail = (value) => String(value || '').trim().toLowerCase();
    const normalizeAdminIdentityMobile = (value) => {
      const digits = String(value || '').replace(/\D/g, '');
      return digits.length >= 10 ? digits.slice(-10) : digits;
    };
    const buildUniqueIdentityIndex = (rows, valueForRow) => {
      const index = new Map();
      const ambiguous = new Set();
      rows.forEach((row) => {
        const value = valueForRow(row);
        if (!value || ambiguous.has(value)) return;
        if (index.has(value)) {
          index.delete(value);
          ambiguous.add(value);
          return;
        }
        index.set(value, String(row._id));
      });
      return index;
    };
    const watchEventNames = ['video_start', 'video_progress', 'video_complete', 'video_watch'];
    const [users, progressRows, progressWatchRows, analyticsWatchRows, latestSessionRows, latestPresenceRows] = await Promise.all([
      User.find(userFilter)
        .sort({ createdAt: -1 })
        .select('fullName email mobileNumber avatar gender age subscriptionStatus subscriptionExpiry purchasedCourses courseEntitlements isMobileVerified isEmailVerified isActive bannedAt banReason deletedAt deletedBy deletionReason marketingOptIn isTester testerSince testerAssignedBy testerNotes createdAt lastActiveAt lastLoginAt loginCount')
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
            userEmail: 1,
            userMobileNumber: 1,
            videoProgress: 1,
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
            totalDurationSeconds: { $sum: { $ifNull: ['$durationSeconds', 0] } },
            watchedVideos: { $addToSet: '$videoId' },
            courses: { $addToSet: '$courseId' },
            completedVideos: { $sum: { $cond: [{ $eq: ['$event', 'video_complete'] }, 1, 0] } },
            lastWatchedAt: { $max: '$createdAt' },
          },
        },
        {
          $project: {
            _id: 0,
            userId: '$_id',
            totalWatchSeconds: 1,
            totalDurationSeconds: 1,
            watchedVideos: { $size: '$watchedVideos' },
            courseCount: {
              $size: {
                $filter: { input: '$courses', as: 'courseId', cond: { $ne: ['$$courseId', null] } },
              },
            },
            completedVideos: 1,
            lastWatchedAt: 1,
          },
        },
      ]),
      Session.aggregate([
        { $match: { ipAddress: { $nin: [null, ''] } } },
        { $sort: { lastPingAt: -1, loggedInAt: -1 } },
        {
          $group: {
            _id: '$user',
            ipAddress: { $first: '$ipAddress' },
            platform: { $first: '$platform' },
            deviceName: { $first: '$deviceName' },
            recordedAt: { $first: { $ifNull: ['$lastPingAt', '$loggedInAt'] } },
          },
        },
        { $project: { _id: 0, userId: { $toString: '$_id' }, ipAddress: 1, platform: 1, deviceName: 1, recordedAt: 1 } },
      ]),
      Session.aggregate([
        { $match: { loggedOutAt: null } },
        { $group: { _id: '$user', lastPingAt: { $max: '$lastPingAt' } } },
        { $project: { _id: 0, userId: { $toString: '$_id' }, lastPingAt: 1 } },
      ]),
    ]);

    const userIds = new Set(users.map((user) => String(user._id)));
    const userObjectIds = users.map((user) => user._id);
    const [subscriptionRows, razorpayBillingRows] = await Promise.all([
      Subscription.find({ user: { $in: userObjectIds } })
        .sort({ createdAt: -1 })
        .select('user gateway status subscriptionType amount trialStartedAt trialExpiresAt trialConverted currentPeriodStart currentPeriodEnd nextBillingAt cancelledAt cancelReason razorpaySubscriptionId razorpayStatus phonePeSubscriptionId phonePeMandateId phonePeAuthRequestId createdAt updatedAt')
        .lean(),
      RazorpayBilling.find({ _id: { $in: userObjectIds } })
        .select('_id mode phase subscriptionId paymentType trialAmount monthlyAmount annualAmount recurringAmount planId trialEnd trialAccessEnd createdAt updatedAt')
        .lean(),
    ]);
    const subscriptionByUser = subscriptionRows.reduce((acc, row) => {
      const key = String(row.user);
      if (!acc[key]) acc[key] = row;
      return acc;
    }, {});
    const razorpayBillingByUser = razorpayBillingRows.reduce((acc, row) => {
      acc[String(row._id)] = row;
      return acc;
    }, {});
    const buildBillingSummary = (user) => {
      const subscription = subscriptionByUser[String(user._id)] || null;
      const razorpayBilling = razorpayBillingByUser[String(user._id)] || null;
      const access = resolveAdminSubscriptionAccess(subscription, user);
      const inGracePeriod = Boolean(access.grace);
      const gateway = subscription?.gateway || (razorpayBilling?.subscriptionId ? 'razorpay' : null);
      const providerStatus = subscription?.razorpayStatus || subscription?.status || razorpayBilling?.phase || null;
      const providerStatusText = String(providerStatus || '').toLowerCase();
      const hasRazorpayMandate = Boolean(subscription?.razorpaySubscriptionId || razorpayBilling?.subscriptionId);
      const hasPhonePeMandate = Boolean(subscription?.phonePeMandateId || subscription?.phonePeSubscriptionId);
      const isCancelled = Boolean(subscription?.cancelledAt)
        || ['cancelled', 'canceled', 'expired', 'halted'].includes(providerStatusText)
        || razorpayBilling?.phase === 'closed';
      const autoRenewEnabled = !isCancelled && (
        (gateway === 'phonepe' && hasPhonePeMandate)
        || (gateway === 'razorpay' && hasRazorpayMandate && (
          ['active', 'authenticated', 'ready'].includes(providerStatusText)
          || ['ready'].includes(String(razorpayBilling?.phase || '').toLowerCase())
        ))
      );
      const terminalMandateStatus = ['expired', 'halted'].includes(providerStatusText)
        ? providerStatusText
        : 'cancelled';
      const mandateStatus = isCancelled
        ? terminalMandateStatus
        : autoRenewEnabled
          ? 'active'
          : (hasPhonePeMandate || hasRazorpayMandate)
            ? 'pending'
            : 'not_started';

      return {
        gateway,
        providerStatus,
        subscriptionStatus: subscription?.status || user.subscriptionStatus || null,
        subscriptionType: subscription?.subscriptionType || razorpayBilling?.paymentType || null,
        amount: subscription?.amount || razorpayBilling?.recurringAmount || razorpayBilling?.monthlyAmount || null,
        autoRenewEnabled,
        inGracePeriod,
        graceStartedAt: access.graceStartedAt || null,
        graceExpiresAt: access.graceExpiresAt || null,
        mandateStatus,
        subscriptionStartedAt: subscription?.currentPeriodStart || subscription?.trialStartedAt || subscription?.createdAt || razorpayBilling?.createdAt || null,
        trialStartedAt: subscription?.trialStartedAt || null,
        trialExpiresAt: subscription?.trialExpiresAt || razorpayBilling?.trialEnd || user.subscriptionExpiry || null,
        currentPeriodStart: subscription?.currentPeriodStart || null,
        currentPeriodEnd: subscription?.currentPeriodEnd || null,
        nextBillingAt: subscription?.nextBillingAt || subscription?.currentPeriodEnd || null,
        cancelledAt: subscription?.cancelledAt || null,
        cancelReason: subscription?.cancelReason || null,
        razorpaySubscriptionId: subscription?.razorpaySubscriptionId || razorpayBilling?.subscriptionId || null,
        phonePeSubscriptionId: subscription?.phonePeSubscriptionId || null,
        phonePeMandateId: subscription?.phonePeMandateId || null,
        phonePeAuthRequestId: subscription?.phonePeAuthRequestId || null,
        billingPhase: razorpayBilling?.phase || null,
        billingMode: razorpayBilling?.mode || null,
        planId: razorpayBilling?.planId || null,
        updatedAt: subscription?.updatedAt || razorpayBilling?.updatedAt || null,
      };
    };
    const usersByEmail = buildUniqueIdentityIndex(users, (user) => normalizeAdminIdentityEmail(user.email));
    const usersByMobile = buildUniqueIdentityIndex(users, (user) => normalizeAdminIdentityMobile(user.mobileNumber));
    const progressByUser = progressRows.reduce((acc, row) => {
      const storedId = String(row.userId || '');
      const resolvedUserId = userIds.has(storedId)
        ? storedId
        : usersByEmail.get(normalizeAdminIdentityEmail(row.userEmail))
          || usersByMobile.get(normalizeAdminIdentityMobile(row.userMobileNumber));
      if (!resolvedUserId) return acc;
      if (!acc[resolvedUserId]) acc[resolvedUserId] = [];
      acc[resolvedUserId].push(row);
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
    const latestSessionByUser = latestSessionRows.reduce((acc, row) => {
      acc[row.userId] = row;
      return acc;
    }, {});
    const presenceByUser = latestPresenceRows.reduce((acc, row) => {
      acc[row.userId] = presenceFromPing(row.lastPingAt);
      return acc;
    }, {});

    res.json(users.map((user) => {
      const userProgress = progressByUser[String(user._id)] || [];
      const courseProgressWatch = userProgress.reduce((summary, course) => {
        Object.values(course.videoProgress || {}).forEach((video) => {
          const watchedSeconds = Math.max(0, Number(video?.watchedSeconds || 0));
          const percent = Math.max(0, Number(video?.percent || 0));
          summary.totalWatchSeconds += watchedSeconds;
          if (watchedSeconds > 0) summary.watchedVideos += 1;
          if (percent >= 95) summary.completedVideos += 1;
        });
        if (course.updatedAt && (!summary.lastWatchedAt || new Date(course.updatedAt) > new Date(summary.lastWatchedAt))) {
          summary.lastWatchedAt = course.updatedAt;
        }
        return summary;
      }, { totalWatchSeconds: 0, watchedVideos: 0, completedVideos: 0, lastWatchedAt: null });
      const recordedWatch = (
        preferAnalyticsWatch
          ? analyticsWatchByUser[String(user._id)] || progressWatchByUser[String(user._id)]
          : progressWatchByUser[String(user._id)]
      );
      const watch = Number(recordedWatch?.totalWatchSeconds || 0) > 0
        ? recordedWatch
        : courseProgressWatch;
      const watchedMinutes = Math.round(Number(watch.totalWatchSeconds || 0) / 60);
      const completedCourses = userProgress.filter((course) => (
        Number(course.totalVideos || 0) > 0
          ? Number(course.completedCount || 0) >= Number(course.totalVideos || 0)
          : Number(course.progressPercent || 0) >= 100
      )).length;
      const analyticsCourseCount = Number(watch.courseCount || 0);
      const analyticsProgressPercent = Number(watch.totalDurationSeconds || 0) > 0
        ? Math.round(Math.min(100, (Number(watch.totalWatchSeconds || 0) / Number(watch.totalDurationSeconds)) * 100))
        : 0;
      const progressCourseCount = userProgress.length || analyticsCourseCount;

      return {
        ...user,
        presence: presenceByUser[String(user._id)] || { isOnline: false, lastSeenAt: user.lastActiveAt || null },
        networkSummary: latestSessionByUser[String(user._id)] || null,
        billingSummary: buildBillingSummary(user),
        progressCourses: userProgress,
        progressSummary: {
          totalCourses: progressCourseCount,
          completedCourses,
          inProgressCourses: Math.max(progressCourseCount - completedCourses, 0),
          averageProgress: userProgress.length
            ? Math.round(userProgress.reduce((sum, course) => sum + Number(course.progressPercent || 0), 0) / userProgress.length)
            : analyticsProgressPercent,
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

app.patch('/api/admin/users/:id/access', protectAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }
    const action = String(req.body.action || '').trim();
    const reason = String(req.body.reason || '').trim().slice(0, 500) || null;
    if (!['ban', 'unban'].includes(action)) {
      return res.status(400).json({ error: 'Action must be ban or unban' });
    }
    if (action === 'ban' && !reason) {
      return res.status(400).json({ error: 'A ban reason is required' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const previousState = { isActive: user.isActive, bannedAt: user.bannedAt, banReason: user.banReason };
    user.isActive = action === 'unban';
    user.bannedAt = action === 'ban' ? new Date() : null;
    user.banReason = action === 'ban' ? reason : null;
    if (action === 'ban') {
      user.activeSessionId = null;
      user.activeSessions = [];
      user.deviceToken = null;
    }
    await user.save();
    await AdminUserAction.create({
      user: user._id,
      action: action === 'ban' ? 'user_banned' : 'user_unbanned',
      reason,
      previousState,
      nextState: { isActive: user.isActive, bannedAt: user.bannedAt, banReason: user.banReason },
      adminSubject: req.admin?.sub || req.admin?.email || 'admin',
    });
    res.json({
      message: action === 'ban' ? 'User banned and active sessions revoked' : 'User unbanned',
      user: { _id: user._id, isActive: user.isActive, bannedAt: user.bannedAt, banReason: user.banReason },
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.patch('/api/admin/users/:id/tester', protectAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }
    const action = String(req.body?.action || '').trim().toLowerCase();
    const notes = String(req.body?.notes || '').trim().slice(0, 500) || null;
    if (!['enable', 'disable'].includes(action)) {
      return res.status(400).json({ error: 'Action must be enable or disable.' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.deletedAt) return res.status(409).json({ error: 'Restore this user before changing tester status.' });
    const adminSubject = req.admin?.sub || req.admin?.email || 'admin';
    const previousState = {
      isTester: Boolean(user.isTester),
      testerSince: user.testerSince,
      testerAssignedBy: user.testerAssignedBy,
      testerNotes: user.testerNotes,
    };
    const enabling = action === 'enable';
    user.isTester = enabling;
    user.testerSince = enabling ? (user.testerSince || new Date()) : null;
    user.testerAssignedBy = enabling ? adminSubject : null;
    user.testerNotes = enabling ? notes : null;
    await user.save();
    const nextState = {
      isTester: Boolean(user.isTester),
      testerSince: user.testerSince,
      testerAssignedBy: user.testerAssignedBy,
      testerNotes: user.testerNotes,
    };
    await AdminUserAction.create({
      user: user._id,
      action: enabling ? 'tester_enabled' : 'tester_disabled',
      reason: notes || (enabling ? 'Tester access enabled by admin' : 'Tester access removed by admin'),
      previousState,
      nextState,
      adminSubject,
    });
    res.json({
      message: enabling ? 'Learner moved to tester analytics.' : 'Tester status removed.',
      user: { _id: user._id, ...nextState },
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.patch('/api/admin/users/:id/password', protectAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }
    const password = String(req.body?.password || '');
    const reason = String(req.body?.reason || 'Temporary password set by admin').trim().slice(0, 500) || 'Temporary password set by admin';
    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({ error: 'Temporary password must contain 8 to 72 characters.' });
    }
    const user = await User.findById(req.params.id).select('+activeSessionId +activeSessions');
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.deletedAt) return res.status(409).json({ error: 'Restore this user before setting a password.' });
    const previousState = {
      hadPassword: Boolean(user.passwordHash),
      activeSessionId: user.activeSessionId || null,
      activeSessions: Array.isArray(user.activeSessions) ? user.activeSessions.length : 0,
    };
    user.passwordHash = await bcrypt.hash(password, 12);
    user.activeSessionId = null;
    user.activeSessions = [];
    user.deviceToken = null;
    await user.save();
    await Session.updateMany(
      { user: user._id, loggedOutAt: null },
      { $set: { loggedOutAt: new Date(), deviceToken: null, refreshTokenHash: null } }
    );
    await AdminUserAction.create({
      user: user._id,
      action: 'password_reset',
      reason,
      previousState,
      nextState: { hadPassword: true, sessionsRevoked: true },
      adminSubject: req.admin?.sub || req.admin?.email || 'admin',
    });
    res.json({
      message: 'Temporary password set. Existing sessions were revoked.',
      user: { _id: user._id },
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.patch('/api/admin/users/:id/subscription', protectAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }
    const { subscriptionChange, verifyEndedBilling } = require('./services/adminSubscription');
    const Billing = require('./models/RazorpayBilling');
    let updatedUser;
    await mongoose.connection.transaction(async (session) => {
      const user = await User.findById(req.params.id).session(session);
      if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });
      if (user.deletedAt) throw Object.assign(new Error('Restore this user before changing subscription access.'), { statusCode: 409 });
      const previous = await Subscription.findOne({ user: user._id }).session(session).lean();
      const billing = await Billing.findById(user._id).session(session).lean();
      const endedStatus = await verifyEndedBilling(previous, billing, (id, mode) =>
        require('./services/razorpayService').api(`/subscriptions/${encodeURIComponent(id)}`, 'GET', undefined, mode));
      if (endedStatus) {
        await Billing.updateOne({ _id: user._id, subscriptionId: billing.subscriptionId }, { $set: { phase: 'closed' } }, { session });
        billing.phase = 'closed';
        if (previous?.razorpaySubscriptionId) previous.razorpayStatus = endedStatus;
      }
      const change = subscriptionChange(req.body, previous || {}, billing);
      if (endedStatus && previous?.razorpaySubscriptionId) change.subscription.razorpayStatus = endedStatus;
      const previousState = { subscriptionStatus: user.subscriptionStatus, subscriptionExpiry: user.subscriptionExpiry, subscriptionDocumentStatus: previous?.status || null };
      const subscription = await Subscription.findOneAndUpdate(
        { user: user._id },
        { $set: change.subscription, $setOnInsert: { user: user._id } },
        { new: true, upsert: true, runValidators: true, session }
      );
      Object.assign(user, change.user, { subscriptionId: subscription._id });
      await user.save({ session });
      await AdminUserAction.create([{
        user: user._id, action: change.status === 'none' ? 'subscription_revoked' : 'subscription_granted',
        reason: change.reason, previousState, nextState: change.user,
        adminSubject: req.admin?.sub || req.admin?.email || 'admin',
      }], { session });
      updatedUser = { _id: user._id, ...change.user };
    });
    res.json({ message: `Subscription changed to ${updatedUser.subscriptionStatus}.`, user: updatedUser });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.get('/api/admin/users/:id/actions', protectAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid user id' });
    const actions = await AdminUserAction.find({ user: req.params.id }).sort({ createdAt: -1 }).limit(25).lean();
    res.json(actions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/users/:id/purchase-history', protectAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid user id' });
    const [user, orders, courseChanges] = await Promise.all([
      User.findById(req.params.id).select('_id fullName email mobileNumber').lean(),
      Order.find({ user: req.params.id }).sort({ createdAt: -1 }).limit(100).lean(),
      AdminUserAction.find({ user: req.params.id, action: { $in: ['course_granted', 'course_revoked'] } })
        .sort({ createdAt: -1 }).limit(100).lean(),
    ]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user, orders, courseChanges });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/users/:id', protectAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }
    const user = await User.findById(req.params.id).select('+activeSessionId +activeSessions');
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.deletedAt) return res.status(409).json({ error: 'User is already in trash' });

    const reason = String(req.body?.reason || 'Moved to trash by admin').trim().slice(0, 500);
    const previousState = { isActive: user.isActive, deletedAt: user.deletedAt };
    user.wasActiveBeforeDeletion = user.isActive !== false;
    user.deletedAt = new Date();
    user.deletedBy = req.admin?.sub || req.admin?.email || 'admin';
    user.deletionReason = reason;
    user.isActive = false;
    user.activeSessionId = null;
    user.activeSessions = [];
    await user.save();
    await AdminUserAction.create({
      user: user._id,
      action: 'user_trashed',
      reason,
      previousState,
      nextState: { isActive: false, deletedAt: user.deletedAt },
      adminSubject: user.deletedBy,
    });
    res.json({
      message: 'User moved to trash',
      user: { _id: user._id, isActive: user.isActive, deletedAt: user.deletedAt, deletedBy: user.deletedBy, deletionReason: user.deletionReason },
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, code: error.code });
  }
});

app.patch('/api/admin/users/:id/restore', protectAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid user id' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.deletedAt) return res.status(409).json({ error: 'User is not in trash' });

    const previousState = { isActive: user.isActive, deletedAt: user.deletedAt };
    user.isActive = user.wasActiveBeforeDeletion !== false;
    user.deletedAt = null;
    user.deletedBy = null;
    user.deletionReason = null;
    await user.save();
    await AdminUserAction.create({
      user: user._id,
      action: 'user_restored',
      reason: 'Restored from trash by admin',
      previousState,
      nextState: { isActive: user.isActive, deletedAt: null },
      adminSubject: req.admin?.sub || req.admin?.email || 'admin',
    });
    res.json({ message: 'User restored successfully', user: { _id: user._id, isActive: user.isActive, deletedAt: null, deletedBy: null, deletionReason: null } });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, code: error.code });
  }
});

app.delete('/api/admin/users/:id/permanent', protectAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid user id' });
    const user = await User.findById(req.params.id).select('deletedAt');
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.deletedAt) return res.status(409).json({ error: 'Move the user to trash before permanent deletion' });
    const { deleteUserAccount } = require('./services/accountDeletionService');
    const force = req.body?.force === true;
    const deletedCounts = await deleteUserAccount(req.params.id, { skipBillingCancellation: force });
    res.json({
      message: 'User permanently deleted',
      deletedCounts,
      billingCancellationSkipped: force,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, code: error.code });
  }
});

// Users Routes
app.get('/api/users', protectAdmin, async (req, res) => {
  try {
    const users = await User.find().select('_id fullName email mobileNumber avatar gender age isActive isMobileVerified isEmailVerified subscriptionStatus subscriptionExpiry createdAt lastActiveAt').lean();
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
    const cacheKey = courseId ? `course:v3:${courseId}` : 'featured:v3';
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
          'thumbnail.mimeType': 1,
          'thumbnailHorizontal.mimeType': 1,
          'thumbnailVertical.mimeType': 1,
          thumbnailUrl: 1,
          thumbnailVerticalUrl: 1,
          averageRating: 1,
          instructor: 1,
          videoCount: { $size: { $ifNull: ['$videos', []] } },
          videos: { $slice: ['$videos', 1] },
        },
      },
      { $unset: 'videos.thumbnail' },
    ]);

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    course.thumbnailUrl = publicCourseThumbnailUrl(course);
    course.thumbnailVerticalUrl = publicCourseThumbnailUrl(course, 'vertical');
    delete course.thumbnail;
    delete course.thumbnailHorizontal;
    delete course.thumbnailVertical;
    await setCachedCheckoutSummary(cacheKey, course);

    setCheckoutSummaryCacheHeaders(res, false);
    res.json(course);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/courses', async (req, res) => {
  try {
    const cacheKey = 'courses:published:list:v11';
    const cached = await getCachedPublicRead(cacheKey);
    if (cached) {
      setPublicReadCacheHeaders(res, true);
      return res.json(cached);
    }

    const courseDocuments = await Course.find({ status: 'published' })
      .select('title slug description category thumbnail.mimeType thumbnailHorizontal.mimeType thumbnailVertical.mimeType thumbnailUrl thumbnailVerticalUrl averageRating totalWishlisted totalStarted totalCompleted completionRate publishedAt createdAt videos._id videos.title videos.thumbnail.mimeType videos.thumbnailUrl videos.thumbnailVerticalUrl')
      .populate('category', 'name slug isActive')
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(100)
      .lean();

    const courses = courseDocuments.map(({ videos, ...course }) => {
      const lessonCount = Array.isArray(videos) ? videos.length : 0;
      const thumbnailUrl = publicCourseThumbnailUrl(course);
      const thumbnailVerticalUrl = publicCourseThumbnailUrl(course, 'vertical');
      const previewVideos = Array.isArray(videos)
        ? videos.slice(0, 40).map((video) => {
          const embeddedVideoThumbnailUrl = video.thumbnail?.mimeType && video._id
            ? `/api/courses/${course._id}/videos/${video._id}/thumbnail`
            : null;
          const videoThumbnailUrl = localThumbnailFileExists(video.thumbnailUrl)
            ? video.thumbnailUrl
            : (isLocalThumbnailUrl(video.thumbnailUrl) ? null : video.thumbnailUrl);
          const videoThumbnailVerticalUrl = localThumbnailFileExists(video.thumbnailVerticalUrl)
            ? video.thumbnailVerticalUrl
            : (isLocalThumbnailUrl(video.thumbnailVerticalUrl) ? null : video.thumbnailVerticalUrl);

          return {
            _id: video._id,
            title: video.title,
            thumbnail: null,
            thumbnailUrl: embeddedVideoThumbnailUrl || videoThumbnailUrl || thumbnailUrl || null,
            thumbnailVerticalUrl: videoThumbnailVerticalUrl || embeddedVideoThumbnailUrl || thumbnailVerticalUrl || videoThumbnailUrl || thumbnailUrl || null,
          };
        })
        : [];
      delete course.thumbnail;
      delete course.thumbnailHorizontal;
      delete course.thumbnailVertical;
      return { ...course, thumbnailUrl, thumbnailVerticalUrl, videos: previewVideos, lessonCount, videoCount: lessonCount };
    });

    await setCachedPublicRead(cacheKey, courses);
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
      return res.status(400).json({ error: 'Every lesson must include a valid permanent video reference' });
    }

    const embeddedHorizontalThumbnail = parseThumbnailDataUrl(
      req.body.thumbnailDataUrl || req.body.thumbnailHorizontalDataUrl,
      'Horizontal thumbnail'
    );
    const embeddedVerticalThumbnail = parseThumbnailDataUrl(req.body.thumbnailVerticalDataUrl, 'Vertical thumbnail');
    const courseId = new mongoose.Types.ObjectId();
    const savedHorizontalThumbnailUrl = await saveThumbnailUpload(courseId, 'horizontal', embeddedHorizontalThumbnail);
    const savedVerticalThumbnailUrl = await saveThumbnailUpload(courseId, 'vertical', embeddedVerticalThumbnail);
    const courseThumbnailUrl = savedHorizontalThumbnailUrl
      || (embeddedHorizontalThumbnail ? null : sanitizeCourseThumbnailUrl(req.body.thumbnailUrl || req.body.thumbnailHorizontalUrl));
    const courseThumbnailVerticalUrl = savedVerticalThumbnailUrl
      || (embeddedVerticalThumbnail ? null : sanitizeCourseThumbnailUrl(req.body.thumbnailVerticalUrl));

    const course = new Course({
      _id: courseId,
      title: req.body.title,
      slug: req.body.slug,
      description: req.body.description,
      thumbnail: null,
      thumbnailHorizontal: null,
      thumbnailVertical: null,
      thumbnailUrl: courseThumbnailUrl,
      thumbnailVerticalUrl: courseThumbnailVerticalUrl,
      videos: applyCourseThumbnailToVideos(sanitizedVideos, embeddedHorizontalThumbnail, courseThumbnailUrl, courseThumbnailVerticalUrl),
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

    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
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
    const query = Course.find();
    if (req.query.summary === '1') {
      query.select('title slug status category createdAt updatedAt thumbnailUrl thumbnailVerticalUrl totalStarted totalCompleted completionRate totalWatchMinutes averageProgress videos._id videos.title videos.videoUrl videos.embedUrl videos.bunnyVideoId videos.awsKey videos.playbackUrl videos.thumbnailUrl');
    }
    const courses = await query
      .populate('category', 'name slug isActive')
      .sort({ createdAt: -1 })
      .lean();

    if (req.query.summary !== '1' || !courses.length) {
      return res.json(courses.map((course) => ({
        ...course,
        videoCount: Array.isArray(course.videos) ? course.videos.length : 0,
      })));
    }

    const courseIds = courses.map((course) => course._id).filter(Boolean);
    const [lessonProgressRows, courseProgressRows] = await Promise.all([
      Progress.aggregate([
        { $match: { course: { $in: courseIds } } },
        {
          $group: {
            _id: '$course',
            learnerIds: { $addToSet: '$user' },
            watchedSeconds: { $sum: { $ifNull: ['$watchedSeconds', 0] } },
            completedRecords: { $sum: { $cond: ['$completed', 1, 0] } },
            progressRecords: { $sum: 1 },
          },
        },
        {
          $project: {
            learnerCount: { $size: '$learnerIds' },
            watchedSeconds: 1,
            completedRecords: 1,
            progressRecords: 1,
          },
        },
      ]),
      CourseProgress.aggregate([
        { $match: { courseId: { $in: courseIds.map((id) => String(id)) } } },
        {
          $group: {
            _id: '$courseId',
            learnerIds: { $addToSet: '$userId' },
            averageProgress: { $avg: '$progressPercent' },
            completedRecords: { $sum: { $cond: [{ $gte: ['$progressPercent', 100] }, 1, 0] } },
          },
        },
        {
          $project: {
            learnerCount: { $size: '$learnerIds' },
            averageProgress: { $round: [{ $ifNull: ['$averageProgress', 0] }, 2] },
            completedRecords: 1,
          },
        },
      ]),
    ]);

    const lessonProgressByCourse = new Map(lessonProgressRows.map((row) => [String(row._id), row]));
    const courseProgressByCourse = new Map(courseProgressRows.map((row) => [String(row._id), row]));

    res.json(courses.map((course) => {
      const id = String(course._id);
      const lessonProgress = lessonProgressByCourse.get(id) || {};
      const courseProgress = courseProgressByCourse.get(id) || {};
      const totalStarted = Math.max(
        Number(course.totalStarted || 0),
        Number(lessonProgress.learnerCount || 0),
        Number(courseProgress.learnerCount || 0)
      );
      const totalCompleted = Math.max(
        Number(course.totalCompleted || 0),
        Number(lessonProgress.completedRecords || 0),
        Number(courseProgress.completedRecords || 0)
      );
      const completionRate = Number(course.completionRate || 0) || (totalStarted ? Math.round((totalCompleted / totalStarted) * 100) : 0);
      return {
        ...course,
        totalStarted,
        totalCompleted,
        completionRate,
        averageProgress: Number(course.averageProgress || 0) || Number(courseProgress.averageProgress || 0),
        totalWatchMinutes: Number(course.totalWatchMinutes || 0) || Math.round(Number(lessonProgress.watchedSeconds || 0) / 60),
        videoCount: Array.isArray(course.videos) ? course.videos.length : 0,
      };
    }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/admin/courses/:id', protectAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid course id' });
    }

    const existingCourse = await Course.findById(req.params.id).select('completionOrder videos thumbnail thumbnailHorizontal thumbnailVertical thumbnailUrl thumbnailVerticalUrl');
    if (!existingCourse) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const updates = {};
    const stringFields = ['title', 'slug', 'description', 'thumbnailUrl', 'thumbnailVerticalUrl'];

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
      updates.thumbnailUrl = sanitizeCourseThumbnailUrl(req.body.thumbnailUrl || req.body.thumbnailHorizontalUrl);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'thumbnailVerticalUrl')) {
      updates.thumbnailVerticalUrl = sanitizeCourseThumbnailUrl(req.body.thumbnailVerticalUrl);
    }

    if (
      Object.prototype.hasOwnProperty.call(req.body, 'thumbnailDataUrl')
      || Object.prototype.hasOwnProperty.call(req.body, 'thumbnailHorizontalDataUrl')
    ) {
      const embeddedHorizontalThumbnail = parseThumbnailDataUrl(
        req.body.thumbnailDataUrl || req.body.thumbnailHorizontalDataUrl,
        'Horizontal thumbnail'
      );
      if (embeddedHorizontalThumbnail) {
        updates.thumbnail = null;
        updates.thumbnailHorizontal = null;
        updates.thumbnailUrl = await saveThumbnailUpload(req.params.id, 'horizontal', embeddedHorizontalThumbnail);
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'thumbnailVerticalDataUrl')) {
      const embeddedVerticalThumbnail = parseThumbnailDataUrl(req.body.thumbnailVerticalDataUrl, 'Vertical thumbnail');
      if (embeddedVerticalThumbnail) {
        updates.thumbnailVertical = null;
        updates.thumbnailVerticalUrl = await saveThumbnailUpload(req.params.id, 'vertical', embeddedVerticalThumbnail);
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'videos')) {
      const sanitizedVideos = sanitizeCourseVideos(req.body.videos, existingCourse.videos);
      if (!sanitizedVideos) {
        return res.status(400).json({ error: 'Every lesson must include a valid permanent video reference' });
      }
      updates.completionOrder = existingCourse.completionOrder?.length ? Array.from(existingCourse.completionOrder) : existingCourse.videos.map(v=>String(v._id));
      updates.videos = applyCourseThumbnailToVideos(
        sanitizedVideos,
        Object.prototype.hasOwnProperty.call(updates, 'thumbnail') ? updates.thumbnail : existingCourse.thumbnail,
        Object.prototype.hasOwnProperty.call(updates, 'thumbnailUrl') ? updates.thumbnailUrl : existingCourse.thumbnailUrl,
        Object.prototype.hasOwnProperty.call(updates, 'thumbnailVerticalUrl') ? updates.thumbnailVerticalUrl : existingCourse.thumbnailVerticalUrl
      );
    }

    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    Object.assign(course, updates);
    await course.validate();
    if (updates.videos) {
      // Bind legacy index-based lesson records before an edit can reorder their source videos.
      await Lesson.bulkWrite(existingCourse.videos.map((video,index)=>({updateMany:{filter:{course:course._id,videoIndex:index,videoId:null},update:{$set:{videoId:video._id}}}})));
    }
    await course.save();
    await course.populate('category', 'name slug isActive');

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

    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    res.status(400).json({ error: error.message });
  }
});

app.get('/api/admin/courses/:id', protectAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid course id' });
    }

    const course = await Course.findById(req.params.id)
      .select('title slug description category status thumbnailUrl thumbnailVerticalUrl notesUrl videos._id videos.title videos.topic videos.description videos.notes videos.sourceType videos.provider videos.videoUrl videos.embedUrl videos.bunnyVideoId videos.bunnyLibraryId videos.youtubeId videos.thumbnailUrl videos.thumbnailVerticalUrl videos.transcriptUrl videos.notesUrl videos.examplePrompt videos.duration videos.order')
      .populate('category', 'name slug isActive')
      .lean();

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    res.json({
      ...course,
      videoCount: Array.isArray(course.videos) ? course.videos.length : 0,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/admin/courses/:courseId/videos/:videoId/notes', protectAdmin, async (req, res) => {
  try {
    const { courseId, videoId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(courseId) || !mongoose.Types.ObjectId.isValid(videoId)) {
      return res.status(400).json({ error: 'Invalid course or lesson id' });
    }

    const notes = normalizeLessonNotes(req.body?.notes);
    const course = await Course.findOneAndUpdate(
      { _id: courseId, 'videos._id': videoId },
      { $set: { 'videos.$.notes': notes } },
      { new: true, runValidators: true }
    ).select('_id videos._id videos.notes updatedAt').lean();

    if (!course) return res.status(404).json({ error: 'Course or lesson not found' });
    const video = course.videos.find((item) => String(item._id) === String(videoId));
    if (!video) return res.status(404).json({ error: 'Lesson not found' });

    await clearPublicCourseCaches();
    return res.json({
      message: 'Lesson notes saved.',
      courseId: String(course._id),
      updatedAt: course.updatedAt,
      video: { _id: String(video._id), notes: video.notes || '' },
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const details = Object.values(error.errors).map((fieldError) => fieldError.message);
      return res.status(400).json({ error: details.join(', ') });
    }
    return res.status(error.statusCode || 500).json({ error: error.message || 'Unable to save lesson notes.' });
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

const HOST = process.env.HOST || '127.0.0.1';

app.listen(PORT, HOST, () => {
  console.log(`Skillomate API listening on http://${HOST}:${PORT}`);
});
// meri marji mai chahye kuch bhi karu
