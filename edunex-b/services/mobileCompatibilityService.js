const mongoose = require('mongoose');
const AnalyticsEvent = require('../models/AnalyticsEvent');
const Course = require('../models/Course');
const CourseProgress = require('../models/CourseProgress');
const Lesson = require('../models/Lesson');
const Subscription = require('../models/Subscription');
const User = require('../models/User');

const API_BASE_URL = String(process.env.API_BASE_URL || '').replace(/\/+$/, '');
const BUNNY_LIBRARY_ID = process.env.BUNNY_LIBRARY_ID || process.env.BUNNY_STREAM_LIBRARY_ID || '675520';
const BUNNY_API_KEY = process.env.BUNNY_API_KEY || process.env.BUNNY_STREAM_API_KEY || '';
const BUNNY_PULL_ZONE_URL = process.env.BUNNY_PULL_ZONE_URL
  || (process.env.BUNNY_STREAM_CDN_HOSTNAME ? `https://${process.env.BUNNY_STREAM_CDN_HOSTNAME}/` : '');
const BUNNY_CDN_HOST = process.env.BUNNY_CDN_HOST
  || process.env.BUNNY_STREAM_CDN_HOSTNAME
  || hostFromUrl(BUNNY_PULL_ZONE_URL);

const bunnyPullZoneCache = new Map();

function httpError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function hostFromUrl(value) {
  try {
    return new URL(value).hostname;
  } catch (_) {
    return '';
  }
}

function objectId(value, label = 'id') {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw httpError(`Invalid ${label}`, 400);
  }
  return new mongoose.Types.ObjectId(value);
}

function normalizeImageUrl(url) {
  if (!url) return null;
  let normalized = String(url)
    .replace(/^http:\/\/localhost(?::\d+)?/i, API_BASE_URL)
    .replace(/^http:\/\/127\.0\.0\.1(?::\d+)?/i, API_BASE_URL);

  if (/^https?:\/\/(?:www\.)?drive\.google\.com\//i.test(normalized)) {
    const pathMatch = normalized.match(/\/(?:file\/)?d\/([a-zA-Z0-9_-]+)/i);
    const queryMatch = normalized.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
    const driveFileId = pathMatch?.[1] || queryMatch?.[1];
    if (driveFileId) {
      normalized = `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveFileId)}&sz=w1600`;
    }
  }
  return normalized;
}

function getCourseImageUrls(course) {
  const thumbnailUrl = normalizeImageUrl(course?.thumbnailUrl);
  const thumbnailVerticalUrl = normalizeImageUrl(course?.thumbnailVerticalUrl);
  const fallbackThumbnailUrl = API_BASE_URL && course?._id
    ? `${API_BASE_URL}/api/courses/${course._id}/thumbnail`
    : null;

  return {
    thumbnailUrl: thumbnailUrl || thumbnailVerticalUrl || fallbackThumbnailUrl,
    thumbnailVerticalUrl: thumbnailVerticalUrl || thumbnailUrl || fallbackThumbnailUrl,
  };
}

function getVideoKey(video, index = 0) {
  return String(
    video?._id ||
    video?.id ||
    video?.bunnyVideoId ||
    video?.bunnyGuid ||
    video?.youtubeId ||
    video?.videoId ||
    index
  );
}

function videoAliases(video, index = 0) {
  return [
    video?._id,
    video?.id,
    video?.bunnyVideoId,
    video?.bunnyGuid,
    video?.youtubeId,
    video?.videoId,
    index,
  ]
    .filter((value) => value !== undefined && value !== null && value !== '')
    .map(String);
}

function findVideoIndexById(videos, videoId) {
  const target = String(videoId);
  return videos.findIndex((video, index) => videoAliases(video, index).includes(target));
}

function canonicalVideoIdFor(videos, videoId) {
  const index = findVideoIndexById(videos, videoId);
  return index >= 0 ? getVideoKey(videos[index], index) : String(videoId);
}

function safeProgressKey(id) {
  return String(id).replace(/[.$]/g, '_');
}

function publicVideoInfo(video = {}, index = 0) {
  return {
    _id: getVideoKey(video, index),
    title: video.title || `Video ${index + 1}`,
    topic: video.topic || null,
    order: video.order ?? index + 1,
    duration: video.duration ?? video.durationSeconds ?? video.lengthSeconds ?? video.videoDuration ?? null,
  };
}

function publicPlayableVideoInfo(video = {}, index = 0) {
  const provider = require('./videoSources').inferProvider(video);
  if (provider === 'aws_cloudfront') return { ...publicVideoInfo(video,index), provider, sourceType:provider, playbackRequired:true, transcriptUrl:video.transcriptUrl || null, thumbnailVerticalUrl:video.thumbnailVerticalUrl || null, description:video.description || '', thumbnailUrl:video.thumbnailUrl || null, examplePrompt:video.examplePrompt || '' };

  const bunnyVideoId = video.bunnyVideoId || video.bunnyGuid || null;
  const hlsUrl = video.hlsUrl || video.playlistUrl || video.streamUrl || (
    bunnyVideoId && BUNNY_PULL_ZONE_URL
      ? new URL(`${encodeURIComponent(bunnyVideoId)}/playlist.m3u8`, BUNNY_PULL_ZONE_URL.endsWith('/') ? BUNNY_PULL_ZONE_URL : `${BUNNY_PULL_ZONE_URL}/`).href
      : null
  );

  return {
    ...publicVideoInfo(video, index),
    provider,
    transcriptUrl: video.transcriptUrl || null,
    sourceType: provider,
    youtubeId: video.youtubeId || video.videoId || null,
    bunnyGuid: bunnyVideoId,
    bunnyVideoId,
    bunnyLibraryId: video.bunnyLibraryId || null,
    videoUrl: video.videoUrl || null,
    embedUrl: video.embedUrl || null,
    hlsUrl,
    description: video.description || video.videoDescription || video.desc || video.summary || '',
    thumbnailUrl: video.thumbnailUrl || null,
    thumbnailVerticalUrl: video.thumbnailVerticalUrl || null,
    examplePrompt: video.examplePrompt || video.examplePromptUrl || '',
  };
}

function serializeCourse(course, options = {}) {
  const source = typeof course.toObject === 'function' ? course.toObject() : course;
  const videos = Array.isArray(source.videos) ? source.videos : [];
  return {
    ...source,
    _id: String(source._id),
    lessonCount: videos.length,
    videoCount: videos.length,
    videos: videos.map(options.playableVideos ? publicPlayableVideoInfo : publicVideoInfo),
    ...getCourseImageUrls(source),
  };
}

function serializeCertificate(certificate) {
  const source = typeof certificate.toObject === 'function' ? certificate.toObject() : certificate;
  return require('./certificationService').certificateView(source);
}

function isFutureDate(value) {
  if (!value) return true;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? true : time > Date.now();
}

async function hasCourseAccess(user) {
  const subscription = await Subscription.findOne({ user: user._id }).lean();
  const status = String(subscription?.status || user.subscriptionStatus || 'none').toLowerCase();

  if (status === 'trial' || status === '1rs trial') {
    return isFutureDate(subscription?.trialExpiresAt || user.subscriptionExpiry);
  }

  if (status === 'active' || status === 'subscribed') {
    return isFutureDate(subscription?.currentPeriodEnd || user.subscriptionExpiry);
  }

  return false;
}

async function getCourse(courseId, projection = null) {
  const query = Course.findById(objectId(courseId, 'course id'));
  if (projection) query.select(projection);
  const course = await query.lean();
  if (!course) {
    throw httpError('Course not found', 404);
  }
  return course;
}

function trackEvent(payload) {
  const date = new Date().toISOString().slice(0, 10);
  AnalyticsEvent.create({ ...payload, date, createdAt: new Date() }).catch(() => {});
}

function progressMap(rows) {
  return rows.reduce((acc, row) => {
    acc[row.courseId] = {
      completedVideoIds: row.completedVideoIds || [],
      completedCount: row.completedCount || 0,
      totalVideos: row.totalVideos || 0,
      progressPercent: row.progressPercent || 0,
      videoProgress: row.videoProgress || {},
      lastWatchedVideoId: row.lastWatchedVideoId || null,
      lastCompletedVideoId: row.lastCompletedVideoId || null,
      updatedAt: row.updatedAt,
    };
    return acc;
  }, {});
}

async function progressForUser(userId) {
  const rows = await CourseProgress.find({ userId: String(userId) }).lean();
  return progressMap(rows);
}

async function completeVideo(args) {
  return require('./certificationService').completeVideo(args);
}
async function updateVideoProgress(args) {
  return require('./certificationService').recordPlayback(args);
}

async function syncLessonProgress({ user, lessonId, courseId, watchedSeconds = 0, completed = false, duration = 0 }) {
  const lesson = await Lesson.findOne({
    _id: objectId(lessonId, 'lesson id'),
    course: objectId(courseId, 'course id'),
  }).lean();
  if (!lesson) {
    throw httpError('Lesson not found', 404);
  }

  const course = await getCourse(courseId, 'title videos');
  const videos = Array.isArray(course.videos) ? course.videos : [];
  const video = lesson.videoId ? videos.find(v=>String(v._id)===String(lesson.videoId)) : videos[lesson.videoIndex];
  if (!video) {
    throw httpError('Video not found at this lesson index', 404);
  }

  const videoId = getVideoKey(video, lesson.videoIndex);
  const videoDuration = Number(duration) || Number(video.duration) || Number(video.durationSeconds) || Number(video.lengthSeconds) || 0;

  const result = completed
    ? await completeVideo({ user, courseId, videoId })
    : await updateVideoProgress({ user, courseId, videoId, currentTime: watchedSeconds, duration: videoDuration, sessionId: user.activeSessionId || String(user._id) });
  return { ...result, lessonCompleted: result.progress.completedVideoIds.includes(videoId) };

}

async function topCourses(limit = 6) {
  const topEnrolled = await CourseProgress.aggregate([
    { $group: { _id: '$courseId', studentCount: { $sum: 1 } } },
    { $sort: { studentCount: -1 } },
    { $limit: limit },
  ]);
  const courseIds = topEnrolled
    .map((item) => (mongoose.Types.ObjectId.isValid(item._id) ? new mongoose.Types.ObjectId(item._id) : null))
    .filter(Boolean);
  const countMap = topEnrolled.reduce((acc, item) => {
    acc[String(item._id)] = item.studentCount;
    return acc;
  }, {});

  let courses = courseIds.length
    ? await Course.find({ _id: { $in: courseIds }, status: 'published' }).lean()
    : [];

  courses = courses
    .map((course) => ({ ...course, studentCount: countMap[String(course._id)] || 0 }))
    .sort((a, b) => b.studentCount - a.studentCount);

  if (courses.length < limit) {
    const existingIds = new Set(courses.map((course) => String(course._id)));
    const extra = await Course.find({ status: 'published' })
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(limit * 2)
      .lean();

    for (const course of extra) {
      if (!existingIds.has(String(course._id))) {
        courses.push({ ...course, studentCount: 0 });
      }
      if (courses.length === limit) break;
    }
  }

  return courses.map(serializeCourse);
}

async function mostWatchedVideo() {
  const ranked = await AnalyticsEvent.aggregate([
    { $match: { event: 'video_start', courseId: { $type: 'string' }, videoId: { $type: 'string' } } },
    {
      $group: {
        _id: { courseId: '$courseId', videoId: '$videoId' },
        watchCount: { $sum: 1 },
        lastWatchedAt: { $max: '$createdAt' },
      },
    },
    { $sort: { watchCount: -1, lastWatchedAt: -1 } },
    { $limit: 20 },
  ]);

  for (const item of ranked) {
    if (!mongoose.Types.ObjectId.isValid(item._id.courseId)) continue;
    const course = await Course.findOne({ _id: item._id.courseId, status: 'published' }).lean();
    const videos = Array.isArray(course?.videos)
      ? course.videos.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      : [];
    const videoIndex = videos.findIndex((video, index) => getVideoKey(video, index) === item._id.videoId);
    if (!course || videoIndex < 0) continue;

    return {
      watchCount: item.watchCount,
      lastWatchedAt: item.lastWatchedAt,
      videoIndex,
      video: publicPlayableVideoInfo(videos[videoIndex], videoIndex),
      course: serializeCourse({ ...course, videos }),
    };
  }

  const fallbackCourse = await Course.findOne({ status: 'published', 'videos.0': { $exists: true } })
    .sort({ publishedAt: -1, createdAt: -1 })
    .lean();
  const fallbackVideos = Array.isArray(fallbackCourse?.videos)
    ? fallbackCourse.videos.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : [];
  const playableIndex = fallbackVideos.findIndex((video) => (
    video?.bunnyVideoId ||
    video?.bunnyGuid ||
    video?.videoUrl ||
    video?.youtubeId ||
    video?.videoId
  ));
  if (!fallbackCourse || playableIndex < 0) {
    throw httpError('No playable videos found', 404);
  }

  return {
    watchCount: 0,
    lastWatchedAt: null,
    videoIndex: playableIndex,
    video: publicPlayableVideoInfo(fallbackVideos[playableIndex], playableIndex),
    course: serializeCourse({ ...fallbackCourse, videos: fallbackVideos }),
  };
}

function extractBunnyLibraryId(url) {
  return String(url || '').match(/\/embed\/(\d+)\//)?.[1] || '';
}

function extractBunnyHost(html) {
  return String(html || '').match(/https:\/\/([^/"']+\.b-cdn\.net)\//i)?.[1] || '';
}

async function findBunnyLibraryIdForGuid(guid) {
  const course = await Course.findOne({
    $or: [
      { 'videos.bunnyVideoId': guid },
      { 'videos.bunnyGuid': guid },
      { 'videos.videoUrl': { $regex: guid, $options: 'i' } },
      { 'videos.embedUrl': { $regex: guid, $options: 'i' } },
    ],
  }).select('videos').lean();

  const video = (course?.videos || []).find((item) => (
    item?.bunnyVideoId === guid ||
    item?.bunnyGuid === guid ||
    String(item?.videoUrl || '').includes(guid) ||
    String(item?.embedUrl || '').includes(guid)
  ));

  return video?.bunnyLibraryId || extractBunnyLibraryId(video?.embedUrl || video?.videoUrl) || BUNNY_LIBRARY_ID;
}

async function getBunnyPullZone(guid, libraryId = BUNNY_LIBRARY_ID) {
  const cacheKey = `${libraryId}:${guid}`;
  const cached = bunnyPullZoneCache.get(cacheKey);
  if (cached) return cached;

  const knownHost = libraryId === BUNNY_LIBRARY_ID && BUNNY_CDN_HOST ? BUNNY_CDN_HOST : '';
  if (knownHost) {
    bunnyPullZoneCache.set(cacheKey, knownHost);
    return knownHost;
  }

  const embedRes = await fetch(`https://player.mediadelivery.net/embed/${encodeURIComponent(libraryId)}/${encodeURIComponent(guid)}`);
  if (embedRes.ok) {
    const host = extractBunnyHost(await embedRes.text());
    if (host) {
      bunnyPullZoneCache.set(cacheKey, host);
      return host;
    }
  }

  if (BUNNY_API_KEY) {
    const response = await fetch(
      `https://video.bunnycdn.com/library/${encodeURIComponent(libraryId)}/videos/${encodeURIComponent(guid)}`,
      { headers: { AccessKey: BUNNY_API_KEY } }
    );
    if (response.ok) {
      const data = await response.json();
      if (data.pullZone) {
        const host = `${data.pullZone}.b-cdn.net`;
        bunnyPullZoneCache.set(cacheKey, host);
        return host;
      }
    }
  }

  return '';
}

module.exports = {
  completeVideo,
  findBunnyLibraryIdForGuid,
  getBunnyPullZone,
  getCourse,
  hasCourseAccess,
  mostWatchedVideo,
  objectId,
  progressForUser,
  publicPlayableVideoInfo,
  publicVideoInfo,
  serializeCertificate,
  serializeCourse,
  syncLessonProgress,
  topCourses,
  trackEvent,
  updateVideoProgress,
};
