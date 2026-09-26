const express = require('express');
const { Readable } = require('stream');
const Course = require('../models/Course');
const CourseProgress = require('../models/CourseProgress');
const Subscription = require('../models/Subscription');
const AppleSubscription = require('../models/AppleSubscription');
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
const { deleteProfileImage, uploadProfileImage } = require('../services/profileImageStorage');
const { createDownloadGrantService } = require('../services/downloadGrantService');
const { sensitiveRateLimit } = require('../middleware/sensitiveRateLimit');

const router = express.Router();
const { handleTutorChat } = require('./ai');
const downloadGrants = createDownloadGrantService();

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
    const [subscription, appleSubscription] = await Promise.all([
      Subscription.findOne({ user: req.compatUser._id }).lean(),
      AppleSubscription.findOne({ user: req.compatUser._id }).lean(),
    ]);
    const access = require('../services/subscriptionAccess')
      .resolveCombinedSubscriptionAccess(subscription, appleSubscription, req.compatUser);
    const status = access.active ? 'active' : (subscription?.status || req.compatUser.subscriptionStatus || 'none');

    res.json({
      subscriptionStatus: status,
      entitlementState: access.entitlementState,
      entitlementActive: access.active,
      entitlementSource: access.source,
      serverNow: new Date(),
      subscriptionDocStatus: subscription?.status || null,
      subscriptionExpiry: access.expiresAt || null,
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
    const { courseId } = req.body;
    const userId = req.body.userId || req.compatUser._id;
    if (!courseId) {
      return res.status(400).json({ error: 'courseId required' });
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
    const { courseId, videoId } = req.body;
    const userId = req.body.userId || req.compatUser._id;
    if (!courseId || !videoId) {
      return res.status(400).json({ error: 'courseId and videoId required' });
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
    const { courseId, videoId, currentTime = 0, duration = 0 } = req.body;
    const userId = req.body.userId || req.compatUser._id;
    if (!courseId || !videoId) {
      return res.status(400).json({ error: 'courseId and videoId required' });
    }
    requireSameUser(req, userId);

    res.json(await updateVideoProgress({
      user: req.compatUser,
      courseId,
      videoId,
      currentTime,
      sessionId: req.compatAuth.sessionId,
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

    const course = await getCourse(req.params.id, 'title videos status');
    if (course.status !== 'published') return res.status(403).json({ error: 'Course is not published' });
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
      'provider',
      'thumbnailUrl',
      'thumbnailVerticalUrl',
      'transcriptUrl',
      'examplePrompt',
    ]);
    const normalizedBody = { ...req.body };
    if (normalizedBody.bunnyGuid && !normalizedBody.bunnyVideoId) {
      normalizedBody.bunnyVideoId = normalizedBody.bunnyGuid;
    }

    const course = await Course.findById(objectId(courseId, 'course id'));
    if (!course) return res.status(404).json({ error: 'Course not found' });
    const video = course.videos.find(v => [String(v._id), v.bunnyVideoId, v.youtubeId].includes(videoId));
    if (!video) return res.status(404).json({ error: 'Video not found' });
    for (const [key,value] of Object.entries(normalizedBody)) if (allowed.has(key) && key !== 'bunnyGuid') video[key] = value;
    if (normalizedBody.provider || normalizedBody.sourceType) video.provider = normalizedBody.provider || normalizedBody.sourceType;
    await course.save();
    res.json({ ok: true });
  })
);

router.patch(
  '/user/:id/avatar',
  requireCompatibleAuth({ userIdNames: ['id', 'userId'] }),
  asyncHandler(async (req, res) => {
    requireSameUser(req, req.params.id);
    const avatar = String(req.body.avatar || '').trim();
    if (!/^(?:a(?:1[0-5]|[1-9])|[fm][1-6])$/.test(avatar)) {
      return res.status(400).json({ error: 'avatar required' });
    }
    const current = await User.findById(req.compatUser._id).select('+avatarStorageKey');
    if (current?.avatarStorageKey) await deleteProfileImage(current.avatarStorageKey).catch(() => {});
    await User.findByIdAndUpdate(req.compatUser._id, { avatar, avatarStorageKey: null });
    res.json({ ok: true, avatar });
  })
);

router.put(
  '/user/:id/avatar-photo',
  requireCompatibleAuth({ userIdNames: ['id', 'userId'] }),
  sensitiveRateLimit({ namespace: 'profile-photo-upload', windowMs: 60 * 60 * 1000, max: 20 }),
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }),
  asyncHandler(async (req, res) => {
    requireSameUser(req, req.params.id);
    const mimeType = String(req.headers['content-type'] || '').split(';')[0].toLowerCase();
    const current = await User.findById(req.compatUser._id).select('+avatarStorageKey');
    const uploaded = await uploadProfileImage(req.compatUser._id, req.body, mimeType);
    await User.updateOne({ _id: req.compatUser._id }, { $set: { avatar: uploaded.url, avatarStorageKey: uploaded.key } });
    if (current?.avatarStorageKey && current.avatarStorageKey !== uploaded.key) {
      await deleteProfileImage(current.avatarStorageKey).catch(() => {});
    }
    res.json({ ok: true, avatar: uploaded.url });
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

router.post(
  '/videos/:guid/download-grant',
  requireCompatibleAuth(),
  asyncHandler(async (req, res) => {
    if (!await hasCourseAccess(req.compatUser)) {
      return res.status(403).json({ error: 'Subscription required' });
    }

    const guid = String(req.params.guid || '').trim();
    const course = await Course.findOne({ status: 'published', 'videos.bunnyVideoId': guid })
      .select('_id title videos.bunnyVideoId videos.bunnyLibraryId videos.title')
      .lean();
    const video = course?.videos?.find(item => String(item.bunnyVideoId || '') === guid);
    if (!course || !video) return res.status(404).json({ error: 'Video is not available for download' });
    const libraryId = video.bunnyLibraryId || await findBunnyLibraryIdForGuid(guid);
    const cdnHost = await getBunnyPullZone(guid, libraryId);
    if (!cdnHost) {
      return res.status(503).json({ error: 'Downloads are not configured on the server' });
    }

    const grant = await downloadGrants.issue({
      userId: req.compatAuth.userId,
      guid,
      libraryId,
      courseId: String(course._id),
      courseTitle: course.title,
      videoTitle: video.title,
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      downloadUrl: `/api/videos/${encodeURIComponent(guid)}/download?token=${encodeURIComponent(grant.token)}`,
      expiresAt: grant.expiresAt,
    });
  })
);

router.get(
  '/videos/:guid/download',
  asyncHandler(async (req, res) => {
    const guid = String(req.params.guid || '').trim();
    const grant = await downloadGrants.consume({ guid, token: req.query.token });
    if (!grant) return res.status(401).json({ error: 'Download authorization is invalid or expired' });
    const grantUser = await User.findById(grant.user).select('_id isActive').lean();
    if (!grantUser || grantUser.isActive === false || !await hasCourseAccess(grantUser)) {
      return res.status(403).json({ error: 'Subscription required' });
    }

    const libraryId = grant.libraryId || await findBunnyLibraryIdForGuid(guid);
    const cdnHost = await getBunnyPullZone(guid, libraryId);
    if (!cdnHost) return res.status(503).json({ error: 'Downloads are not configured on the server' });

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
      userId: String(grant.user),
      courseId: grant.courseId || '',
      courseTitle: grant.courseTitle || '',
      videoId: guid,
      videoTitle: grant.videoTitle || '',
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
  requireCompatibleAuth({ userProjection: '+activeSessionId +activeSessions +aiConsentGranted +aiConsentPolicyVersion +aiConsentProviderVersion +aiConsentDecidedAt' }),
  asyncHandler(async (req, res) => {
    const { userId, question } = req.body;
    if (!userId || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ error: 'userId and question required' });
    }
    requireSameUser(req, userId);

    req.body = {
      ...req.body,
      message: question,
      history: req.body.messages || [],
      courseId: req.body.courseId,
      pagePath: '/videos',
      assistantName: 'Course AI',
    };
    return handleTutorChat(req, res);
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
