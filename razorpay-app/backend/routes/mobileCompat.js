const express = require('express');
const { Readable } = require('stream');
const Course = require('../models/Course');
const CourseProgress = require('../models/CourseProgress');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const Wishlist = require('../models/Wishlist');
const { protectAdmin } = require('../middleware/adminAuth');
const {
  publicUser,
  requireCompatibleAuth,
  requireSameUser,
} = require('../middleware/compatAuth');
const {
  completeVideo,
  findBunnyLibraryIdForGuid,
  getBunnyPullZone,
  getCourse,
  hasCourseAccess,
  mostWatchedVideo,
  objectId,
  progressForUser,
  publicPlayableVideoInfo,
  serializeCertificate,
  serializeCourse,
  topCourses,
  trackEvent,
  updateVideoProgress,
} = require('../services/mobileCompatibilityService');
const Certificate = require('../models/Certificate');

const router = express.Router();
const AI_SERVER_URL = String(process.env.AI_SERVER_URL || '').replace(/\/+$/, '');

function asyncHandler(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  };
}

async function wishlistForUser(user) {
  const wishlist = await Wishlist.findOne({ user: user._id }).select('courses').lean();
  if (wishlist?.courses) {
    return wishlist.courses.map(String);
  }
  return Array.isArray(user.wishlist) ? user.wishlist.map(String) : [];
}

router.get(
  '/auth/validate/:id',
  requireCompatibleAuth({ userIdNames: ['id', 'userId'] }),
  asyncHandler(async (req, res) => {
    requireSameUser(req, req.params.id);

    res.json({
      valid: true,
      user: publicUser(req.compatUser),
      wishlist: await wishlistForUser(req.compatUser),
    });
  })
);

router.get(
  '/user/:id/subscription',
  requireCompatibleAuth({ userIdNames: ['id', 'userId'] }),
  asyncHandler(async (req, res) => {
    requireSameUser(req, req.params.id);
    const subscription = await Subscription.findOne({ user: req.compatUser._id }).lean();
    const status = subscription?.status || req.compatUser.subscriptionStatus || 'none';

    res.json({
      subscriptionStatus: status,
      subscriptionDocStatus: subscription?.status || null,
      subscriptionExpiry: subscription?.currentPeriodEnd || subscription?.trialExpiresAt || req.compatUser.subscriptionExpiry || null,
      trialExpiresAt: subscription?.trialExpiresAt || null,
      currentPeriodEnd: subscription?.currentPeriodEnd || null,
      nextBillingAt: subscription?.nextBillingAt || null,
      subscriptionHistory: Array.isArray(req.compatUser.subscriptionHistory)
        ? req.compatUser.subscriptionHistory
        : [],
    });
  })
);

router.post(
  '/user/wishlist/toggle',
  requireCompatibleAuth(),
  asyncHandler(async (req, res) => {
    const { userId, courseId } = req.body;
    if (!userId || !courseId) {
      return res.status(400).json({ error: 'userId and courseId required' });
    }
    requireSameUser(req, userId);

    const course = await Course.findById(objectId(courseId, 'course id')).select('_id');
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    let wishlist = await Wishlist.findOne({ user: req.compatUser._id });
    if (!wishlist) {
      wishlist = await Wishlist.create({ user: req.compatUser._id, courses: [] });
    }

    const alreadyWishlisted = wishlist.courses.some((id) => String(id) === String(courseId));
    const update = alreadyWishlisted
      ? { $pull: { wishlist: String(courseId) } }
      : { $addToSet: { wishlist: String(courseId) } };

    if (alreadyWishlisted) {
      wishlist.courses = wishlist.courses.filter((id) => String(id) !== String(courseId));
      await Course.findByIdAndUpdate(courseId, { $inc: { totalWishlisted: -1 } });
    } else {
      wishlist.courses.push(courseId);
      await Course.findByIdAndUpdate(courseId, { $inc: { totalWishlisted: 1 } });
    }

    await Promise.all([
      wishlist.save(),
      User.updateOne({ _id: req.compatUser._id }, update),
    ]);

    res.json({
      wishlisted: !alreadyWishlisted,
      wishlist: wishlist.courses.map(String),
      courses: wishlist.courses,
    });
  })
);

router.get(
  '/user/:id/progress',
  requireCompatibleAuth({ userIdNames: ['id', 'userId'] }),
  asyncHandler(async (req, res) => {
    requireSameUser(req, req.params.id);
    res.json({ courseProgress: await progressForUser(req.params.id) });
  })
);

router.post(
  '/user/progress/complete-video',
  requireCompatibleAuth(),
  asyncHandler(async (req, res) => {
    const { userId, courseId, videoId } = req.body;
    if (!userId || !courseId || !videoId) {
      return res.status(400).json({ error: 'userId, courseId, and videoId required' });
    }
    requireSameUser(req, userId);

    res.json(await completeVideo({
      user: req.compatUser,
      courseId,
      videoId,
    }));
  })
);

router.post(
  '/user/progress/update-video',
  requireCompatibleAuth(),
  asyncHandler(async (req, res) => {
    const { userId, courseId, videoId, currentTime = 0, duration = 0 } = req.body;
    if (!userId || !courseId || !videoId) {
      return res.status(400).json({ error: 'userId, courseId, and videoId required' });
    }
    requireSameUser(req, userId);

    res.json(await updateVideoProgress({
      user: req.compatUser,
      courseId,
      videoId,
      currentTime,
      duration,
    }));
  })
);

router.get(
  '/user/:id/certificates',
  requireCompatibleAuth({ userIdNames: ['id', 'userId'] }),
  asyncHandler(async (req, res) => {
    requireSameUser(req, req.params.id);
    const certificates = await Certificate.find({ userId: String(req.params.id) })
      .sort({ issuedAt: -1 })
      .lean();
    res.json({ certificates: certificates.map(serializeCertificate) });
  })
);

router.get(
  '/courses/top',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit || 6), 1), 24);
    res.json(await topCourses(limit));
  })
);

router.get(
  '/videos/most-watched',
  requireCompatibleAuth({ userIdNames: ['userId'] }),
  asyncHandler(async (req, res) => {
    if (!await hasCourseAccess(req.compatUser)) {
      return res.status(403).json({ error: 'Subscription required' });
    }

    res.json(await mostWatchedVideo());
  })
);

router.get(
  '/courses/:id/videos',
  requireCompatibleAuth({ userIdNames: ['userId'] }),
  asyncHandler(async (req, res) => {
    if (!await hasCourseAccess(req.compatUser)) {
      return res.status(403).json({ error: 'Subscription required' });
    }

    const course = await getCourse(req.params.id, 'title videos');
    const videos = Array.isArray(course.videos)
      ? course.videos.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      : [];

    res.json({
      courseTitle: course.title,
      videos: videos.map(publicPlayableVideoInfo),
    });
  })
);

router.patch(
  '/courses/:courseId/videos/:videoId',
  protectAdmin,
  asyncHandler(async (req, res) => {
    const { courseId, videoId } = req.params;
    const allowed = new Set([
      'youtubeId',
      'bunnyVideoId',
      'bunnyGuid',
      'bunnyLibraryId',
      'videoUrl',
      'embedUrl',
      'title',
      'topic',
      'description',
      'duration',
      'order',
      'sourceType',
      'thumbnailUrl',
      'transcriptUrl',
    ]);
    const normalizedBody = { ...req.body };
    if (normalizedBody.bunnyGuid && !normalizedBody.bunnyVideoId) {
      normalizedBody.bunnyVideoId = normalizedBody.bunnyGuid;
    }

    const set = {};
    Object.entries(normalizedBody).forEach(([key, value]) => {
      if (allowed.has(key) && key !== 'bunnyGuid') {
        set[`videos.$.${key}`] = value;
      }
    });

    if (!Object.keys(set).length) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const courseObjectId = objectId(courseId, 'course id');
    const matchers = [
      { _id: courseObjectId, 'videos._id': videoId },
      { _id: courseObjectId, 'videos.bunnyVideoId': videoId },
      { _id: courseObjectId, 'videos.youtubeId': videoId },
    ];

    if (objectIdSafe(videoId)) {
      matchers.splice(1, 0, { _id: courseObjectId, 'videos._id': objectId(videoId, 'video id') });
    }

    let result = null;
    for (const matcher of matchers) {
      result = await Course.updateOne(matcher, { $set: set });
      if (result.matchedCount) break;
    }

    if (!result?.matchedCount) {
      return res.status(404).json({ error: 'Course or video not found' });
    }

    res.json({ ok: true });
  })
);

router.patch(
  '/user/:id/avatar',
  requireCompatibleAuth({ userIdNames: ['id', 'userId'] }),
  asyncHandler(async (req, res) => {
    requireSameUser(req, req.params.id);
    const avatar = String(req.body.avatar || '').trim();
    if (!avatar) {
      return res.status(400).json({ error: 'avatar required' });
    }

    await User.findByIdAndUpdate(req.compatUser._id, { avatar });
    res.json({ ok: true, avatar });
  })
);

router.get(
  '/bunny/thumbnail/:guid',
  asyncHandler(async (req, res) => {
    const guid = String(req.params.guid || '').trim();
    if (!guid) {
      return res.status(400).end();
    }

    const libraryId = req.query.libraryId || await findBunnyLibraryIdForGuid(guid);
    const embed = await fetch(`https://player.mediadelivery.net/embed/${encodeURIComponent(libraryId)}/${encodeURIComponent(guid)}`);
    if (embed.ok) {
      const html = await embed.text();
      const thumbnail = html.match(/<meta property="og:image" content="([^"]+)"/i)?.[1]
        || html.match(/"thumbnailUrl":"([^"]+)"/i)?.[1]?.replace(/\\\//g, '/');
      if (thumbnail) {
        return res.redirect(thumbnail);
      }
    }

    const cdnHost = await getBunnyPullZone(guid, libraryId);
    if (cdnHost) {
      return res.redirect(`https://${cdnHost}/${encodeURIComponent(guid)}/thumbnail.jpg`);
    }

    res.status(404).end();
  })
);

router.get(
  '/videos/:guid/download',
  requireCompatibleAuth({ userIdNames: ['userId'] }),
  asyncHandler(async (req, res) => {
    if (!await hasCourseAccess(req.compatUser)) {
      return res.status(403).json({ error: 'Subscription required' });
    }

    const guid = String(req.params.guid || '').trim();
    const libraryId = req.query.libraryId || await findBunnyLibraryIdForGuid(guid);
    const cdnHost = await getBunnyPullZone(guid, libraryId);
    if (!cdnHost) {
      return res.status(503).json({ error: 'Downloads are not configured on the server' });
    }

    const resolutions = ['720p', '480p', '360p', '240p'];
    let upstream = null;
    let downloadedResolution = null;

    for (const resolution of resolutions) {
      const url = `https://${cdnHost}/${encodeURIComponent(guid)}/play_${resolution}.mp4`;
      const response = await fetch(url, {
        headers: { Referer: 'https://iframe.mediadelivery.net/' },
        redirect: 'follow',
      });
      if (response.ok) {
        upstream = response;
        downloadedResolution = resolution;
        break;
      }
    }

    if (!upstream) {
      return res.status(404).json({ error: 'Video is not available for download' });
    }

    const contentLength = upstream.headers.get('content-length');
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${guid}.mp4"`);
    res.setHeader('Cache-Control', 'no-store');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    trackEvent({
      event: 'video_download',
      userId: req.compatAuth.userId,
      userName: req.compatUser.fullName || '',
      userEmail: req.compatUser.email || '',
      courseId: req.query.courseId || '',
      courseTitle: req.query.courseTitle || '',
      videoId: guid,
      videoTitle: req.query.videoTitle || '',
      resolution: downloadedResolution,
      fileSizeBytes: contentLength ? Number(contentLength) : 0,
    });

    const stream = Readable.fromWeb(upstream.body);
    stream.pipe(res);
    req.on('close', () => stream.destroy());
  })
);

router.post(
  '/course-ai/chat',
  requireCompatibleAuth(),
  asyncHandler(async (req, res) => {
    const { userId, question } = req.body;
    if (!userId || !question?.trim()) {
      return res.status(400).json({ error: 'userId and question required' });
    }
    requireSameUser(req, userId);

    if (!AI_SERVER_URL) {
      return res.status(501).json({
        error: 'Course AI compatibility route is not configured. Set AI_SERVER_URL.',
      });
    }

    const upstream = await fetch(`${AI_SERVER_URL}/api/course-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        videoTitle: req.body.videoTitle,
        videoDescription: req.body.videoDescription,
        currentTime: req.body.currentTime,
        messages: req.body.messages || [],
      }),
    });
    const contentType = upstream.headers.get('content-type') || '';
    const body = contentType.includes('application/json')
      ? await upstream.json()
      : { answer: await upstream.text() };

    res.status(upstream.status).json(body);
  })
);

router.get(
  '/admin/course-progress',
  protectAdmin,
  asyncHandler(async (_req, res) => {
    const rows = await CourseProgress.find({}).sort({ updatedAt: -1 }).lean();
    res.json(rows);
  })
);

function objectIdSafe(value) {
  return /^[a-f\d]{24}$/i.test(String(value || ''));
}

module.exports = router;
