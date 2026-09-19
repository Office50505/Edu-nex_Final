const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { protect } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/checkSubscription');
const User = require('../models/User');
const Course = require('../models/Course');
const Progress = require('../models/Progress');
const Lesson = require('../models/Lesson');
const AiTutorSession = require('../models/AiTutorSession');
const ContactEnquiry = require('../models/ContactEnquiry');
const { syncLessonProgress } = require('../services/mobileCompatibilityService');
const { sendContactEnquiryEmail } = require('../services/supportMailer');

const { playlistProjection, playlistPayload } = require('../services/coursePlaylist');
const router = express.Router();
const requireAccess = [protect, checkSubscription];
const BUNNY_PULL_ZONE_URL = process.env.BUNNY_PULL_ZONE_URL
  || (process.env.BUNNY_STREAM_CDN_HOSTNAME ? `https://${process.env.BUNNY_STREAM_CDN_HOSTNAME}/` : '')
  || 'https://edunex.b-cdn.net/';
const BUNNY_STREAM_LIBRARY_ID = process.env.BUNNY_STREAM_LIBRARY_ID || '';
const ACCESS_TOKEN_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  return 'edunex-development-access-secret';
})();

function courseThumbnailPayload(course) {
  return course?.thumbnailHorizontal || course?.thumbnail || null;
}

function courseThumbnailUrl(course) {
  return course?.thumbnailUrl || (course?._id ? `/api/courses/${course._id}/thumbnail` : null);
}

function courseThumbnailVerticalUrl(course) {
  return course?.thumbnailVerticalUrl || (course?._id ? `/api/courses/${course._id}/thumbnail?orientation=vertical` : null);
}

function bunnyHlsUrl(video) {
  if (video?.hlsUrl || video?.playlistUrl || video?.streamUrl) {
    return video.hlsUrl || video.playlistUrl || video.streamUrl;
  }

  const videoId = String(video?.bunnyVideoId || '').trim();
  if (!videoId) return null;

  const libraryId = String(video?.bunnyLibraryId || '').trim();
  if (BUNNY_STREAM_LIBRARY_ID && libraryId && libraryId !== BUNNY_STREAM_LIBRARY_ID) {
    return null;
  }

  const pullZone = String(BUNNY_PULL_ZONE_URL || '').trim();
  if (!pullZone) return null;

  return new URL(`${encodeURIComponent(videoId)}/playlist.m3u8`, pullZone.endsWith('/') ? pullZone : `${pullZone}/`).href;
}

async function optionalContactUser(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return next();

    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);
    const user = await User.findById(decoded.userId)
      .select('+activeSessionId')
      .lean();

    if (user && user.activeSessionId === decoded.sessionId) {
      req.contactUser = user;
    }

    next();
  } catch (_) {
    next();
  }
}

router.post('/contact-enquiries', optionalContactUser, async (req, res) => {
  try {
    const firstName = String(req.body.firstName || '').trim();
    const lastName = String(req.body.lastName || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const message = String(req.body.message || '').trim();

    if (!firstName || !email || !message) {
      return res.status(400).json({ error: 'First name, email, and message are required' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    const enquiry = await ContactEnquiry.create({
      userId: req.contactUser?._id || null,
      firstName,
      lastName,
      email,
      message,
    });

    let emailDelivered = false;
    try {
      const mailResult = await sendContactEnquiryEmail(enquiry, req.contactUser || null);
      emailDelivered = Boolean(mailResult.sent);
    } catch (mailError) {
      console.error('Contact enquiry email failed', mailError.message);
    }

    res.status(201).json({
      message: 'Enquiry submitted successfully',
      enquiryId: enquiry._id,
      emailDelivered,
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const details = Object.values(error.errors).map((fieldError) => fieldError.message);
      return res.status(400).json({ error: details.join(', ') });
    }

    res.status(500).json({ error: error.message });
  }
});

// Public course artwork is served as an image, never embedded in playlist JSON.
router.get(['/courses/:id/thumbnail', '/courses/:id/videos/:videoId/thumbnail'], async (req, res) => {
  try {
    const { id, videoId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id) || (videoId && !mongoose.Types.ObjectId.isValid(videoId))) {
      return res.status(400).end();
    }
    const filter = { _id: id, status: 'published' };
    if (videoId) filter['videos._id'] = videoId;
    const portrait = req.query.orientation === 'vertical';
    let course;
    if (videoId) {
      course = await Course.findOne(filter).select({ status: 1, 'videos.$': 1 }).lean();
    } else {
      const fields = portrait ? ['thumbnailVertical', 'thumbnailHorizontal', 'thumbnail'] : ['thumbnailHorizontal', 'thumbnail', 'thumbnailVertical'];
      for (const field of fields) {
        const candidate = await Course.findOne(filter).select(`${field} thumbnailUrl thumbnailVerticalUrl`).lean();
        if (!candidate) break;
        course = candidate;
        if (candidate[field]?.data) break;
      }
    }
    if (!course) return res.status(404).end();
    const images = videoId ? [course.videos?.[0]?.thumbnail] : portrait
      ? [course.thumbnailVertical, course.thumbnailHorizontal, course.thumbnail]
      : [course.thumbnailHorizontal, course.thumbnail, course.thumbnailVertical];
    const image = images.find(value => value?.data && ['image/jpeg', 'image/png', 'image/webp'].includes(value.mimeType));
    if (image) {
      res.set('Cache-Control', 'public, max-age=300');
      return res.type(image.mimeType).send(Buffer.from(image.data, 'base64'));
    }
    const url = videoId ? course.videos?.[0]?.thumbnailUrl
      : (portrait ? course.thumbnailVerticalUrl || course.thumbnailUrl : course.thumbnailUrl || course.thumbnailVerticalUrl);
    if (url && /^https?:\/\//i.test(url)) return res.redirect(url);
    return res.status(404).end();
  } catch (error) {
    res.status(500).json({ error: 'Could not load course artwork.' });
  }
});

// GET /courses/:id/lessons → returns the course document with its videos array
router.get('/courses/:id/lessons', requireAccess, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid course id' });
    }

    const course = await Course.findById(req.params.id)
      .select(playlistProjection)
      .lean();

    if (!course || course.status !== 'published') {
      return res.status(404).json({ error: 'Course not found' });
    }

    res.set('Cache-Control', 'private, no-store');
    res.set('Referrer-Policy', 'no-referrer');
    const payload = playlistPayload(course, bunnyHlsUrl);
    if (typeof req.query.playback === 'string' && req.authSessionId) {
      const requested = req.query.playback;
      const numeric = /^\d+$/.test(requested) ? Number(requested) : NaN;
      const index = Number.isSafeInteger(numeric)
        ? Math.min(numeric, Math.max(0, course.videos.length - 1))
        : course.videos.findIndex(video => String(video._id) === requested);
      const video = course.videos[index >= 0 ? index : 0];
      if (video && require('../services/videoSources').inferProvider(video) === 'aws_cloudfront') {
        try {
          const grant = require('../services/cloudFrontPlayback').issueGrant(video.videoUrl, {
            userId: String(req.user._id), sessionId: req.authSessionId,
            courseId: String(course._id), videoId: String(video._id),
          });
          Object.assign(payload.videos[index >= 0 ? index : 0], grant);
        } catch {
          // Keep the playlist usable; the per-lesson authorization route reports configuration errors.
        }
      }
    }
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /lessons/:id → looks up the Lesson, finds the parent Course, and returns the specific video
router.get('/lessons/:id', requireAccess, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid lesson id' });
    }

    const lesson = await Lesson.findById(req.params.id).populate('course', '_id');
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    const course = await Course.findById(lesson.course._id)
      .select(playlistProjection)
      .lean();

    if (!course || course.status !== 'published') {
      return res.status(404).json({ error: 'Course not found' });
    }

    const videoIndex = lesson.videoId ? course.videos.findIndex(v=>String(v._id)===String(lesson.videoId)) : lesson.videoIndex;
    const videoData = course.videos[videoIndex] || null;

    if (!videoData) {
      return res.status(404).json({ error: 'Video not found at this index' });
    }

    if(require('../services/videoSources').inferProvider(videoData)==='aws_cloudfront')return res.json({...require('../services/mobileCompatibilityService').publicPlayableVideoInfo(videoData),_id:lesson._id,videoId:videoData._id,course:course._id,courseTitle:course.title,notesUrl:videoData.notesUrl || course.notesUrl,videoIndex});
    const youtubeEmbedUrl = videoData.youtubeId
      ? `https://www.youtube.com/embed/${videoData.youtubeId}`
      : null;

res.json({
       _id: lesson._id,
       course: course._id,
       courseTitle: course.title,
       title: lesson.title,
       videoIndex,
       sourceType: videoData.youtubeId ? 'youtube' : (videoData.sourceType || 'bunny_stream'),
       videoUrl: videoData.videoUrl || null,
       embedUrl: videoData.embedUrl || youtubeEmbedUrl,
       hlsUrl: bunnyHlsUrl(videoData),
       bunnyVideoId: videoData.bunnyVideoId || null,
       bunnyLibraryId: videoData.bunnyLibraryId || null,
       youtubeId: videoData.youtubeId,
       youtubeUrl: videoData.youtubeId
         ? `https://www.youtube.com/watch?v=${videoData.youtubeId}`
         : null,
       videoDescription: videoData.description || '',
       transcriptUrl: videoData.transcriptUrl || null,
       examplePrompt: videoData.examplePrompt || videoData.examplePromptUrl || '',
       duration: videoData.duration || 0,
       notesUrl: videoData.notesUrl || course.notesUrl || null,
       description: course.description,
       thumbnail: videoData.thumbnailUrl || courseThumbnailUrl(course),
       videoThumbnail: courseThumbnailPayload(course),
       videoThumbnailUrl: videoData.thumbnailUrl || courseThumbnailUrl(course),
       videoThumbnailVerticalUrl: videoData.thumbnailVerticalUrl || courseThumbnailVerticalUrl(course),
       isPreview: false,
     });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Progress endpoints — keep the same shape but video tracking is now via Course.videos
router.get('/progress', requireAccess, async (req, res) => {
  try {
    const filter = { user: req.user._id };
    if (req.query.course) filter.course = req.query.course;

    const progress = await Progress.find(filter).populate('lesson course');
    res.json(progress);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/progress', requireAccess, async (req, res) => {
  try {
    const { lesson, course, watchedSeconds = 0, completed = false, duration = 0 } = req.body;

    if (!mongoose.Types.ObjectId.isValid(lesson) || !mongoose.Types.ObjectId.isValid(course)) {
      return res.status(400).json({ error: 'Invalid lesson or course id' });
    }

    // Validate lesson ownership and record coverage before writing the compatibility projection.
    const result = await syncLessonProgress({ user: req.user, lessonId: lesson, courseId: course, watchedSeconds, duration, completed });
    const actualCompleted = result.lessonCompleted;
    const progress = await Progress.findOneAndUpdate(
      { user: req.user._id, lesson },
      { user: req.user._id, lesson, course, watchedSeconds, completed: actualCompleted, lastWatchedAt: new Date() },
      { new: true, upsert: true, runValidators: true }
    );
    res.status(200).json(progress);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.get('/ai-tutor', requireAccess, async (req, res) => {
  try {
    if (!req.query.course || !mongoose.Types.ObjectId.isValid(req.query.course)) {
      return res.status(400).json({ error: 'Valid course id is required' });
    }

    const session = await AiTutorSession.findOne({
      user: req.user._id,
      course: req.query.course,
    });

    res.json(session || { messages: [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ai-tutor', requireAccess, async (req, res) => {
  try {
    const { course, messages = [] } = req.body;

    if (!mongoose.Types.ObjectId.isValid(course)) {
      return res.status(400).json({ error: 'Valid course id is required' });
    }

    const session = await AiTutorSession.findOneAndUpdate(
      { user: req.user._id, course },
      { messages, lastUpdatedAt: new Date() },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    res.status(200).json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
