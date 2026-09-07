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
  return course?.thumbnailUrl || null;
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

function withRepeatedVideoThumbnails(course) {
  const sharedThumbnail = courseThumbnailPayload(course);
  const sharedThumbnailUrl = courseThumbnailUrl(course);

  return {
    ...course,
    videos: (Array.isArray(course.videos) ? course.videos : []).map((video) => ({
      ...video,
      hlsUrl: bunnyHlsUrl(video),
      thumbnail: sharedThumbnail,
      thumbnailUrl: sharedThumbnailUrl,
    })),
  };
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

    res.status(201).json({
      message: 'Enquiry submitted successfully',
      enquiryId: enquiry._id,
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const details = Object.values(error.errors).map((fieldError) => fieldError.message);
      return res.status(400).json({ error: details.join(', ') });
    }

    res.status(500).json({ error: error.message });
  }
});

// GET /courses/:id/lessons → returns the course document with its videos array
router.get('/courses/:id/lessons', requireAccess, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid course id' });
    }

    const course = await Course.findById(req.params.id)
      .select('title description videos thumbnail thumbnailHorizontal thumbnailUrl notesUrl')
      .lean();

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    res.json(withRepeatedVideoThumbnails(course));
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

    const lesson = await Lesson.findById(req.params.id).populate('course');
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    const course = await Course.findById(lesson.course._id)
      .select('title description videos thumbnail thumbnailHorizontal thumbnailUrl notesUrl')
      .lean();

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const videoIndex = lesson.videoIndex;
    const videoData = course.videos[videoIndex] || null;

    if (!videoData) {
      return res.status(404).json({ error: 'Video not found at this index' });
    }

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
       notesUrl: course.notesUrl || null,
       description: course.description,
       thumbnail: courseThumbnailUrl(course),
       videoThumbnail: courseThumbnailPayload(course),
       videoThumbnailUrl: courseThumbnailUrl(course),
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

    const progress = await Progress.findOneAndUpdate(
      { user: req.user._id, lesson },
      {
        user: req.user._id,
        lesson,
        course,
        watchedSeconds,
        completed,
        lastWatchedAt: new Date(),
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    try {
      await syncLessonProgress({
        user: req.user,
        lessonId: lesson,
        courseId: course,
        watchedSeconds,
        completed,
        duration,
      });
    } catch (error) {
      console.error('Course progress sync error:', error.message);
    }

    res.status(200).json(progress);
  } catch (error) {
    res.status(500).json({ error: error.message });
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
