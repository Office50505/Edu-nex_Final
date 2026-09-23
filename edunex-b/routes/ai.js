const express = require('express');
const Course = require('../models/Course');
const { requireCompatibleAuth } = require('../middleware/compatAuth');
const { FAL_API_KEY, compactText, sanitizeHistory, buildContext, callFalOpenRouter, builtInCourseGuide, cleanLearnerReply, OUT_OF_SCOPE_REPLY } = require('../services/aiTutorService');
const router = express.Router();

router.get('/health', requireCompatibleAuth(), (_req, res) => {
  res.json({
    ok: true,
    service: 'nex-ai',
    provider: FAL_API_KEY ? 'fal-openrouter' : 'built-in-course-guide',
  });
});

router.get('/courses', requireCompatibleAuth(), async (_req, res) => {
  try {
    const courses = await Course.find({ status: 'published' })
      .select('title slug videos.title')
      .sort({ publishedAt: -1, createdAt: -1 })
      .lean();

    res.json(courses.map(course => ({
      id: String(course._id),
      name: course.title,
      slug: course.slug,
      modules: (Array.isArray(course.videos) ? course.videos : [])
        .map(video => compactText(video.title, 200))
        .filter(Boolean),
    })));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not load Nex AI courses' });
  }
});

async function handleTutorChat(req, res) {
  try {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 2000) : '';
    const pagePath = compactText(req.body.pagePath, 160).split(/[?#]/)[0];
    const assistantName = compactText(req.body.assistantName, 80);
    const courseId = compactText(req.body.courseId, 120);
    const lessonId = compactText(req.body.lessonId, 120);
    const history = sanitizeHistory(req.body.history);

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    let provider = 'built-in-course-guide';
    let reply;
    let knowledge;
    if (FAL_API_KEY) {
      try {
        knowledge = await buildContext(req.compatUser, courseId, message, history, { lessonId });
        reply = await callFalOpenRouter({ context: knowledge.context, message, pagePath, assistantName, history });
        provider = 'fal-openrouter';
      } catch (error) {
        console.warn(`Nex AI provider unavailable; using built-in course guide: ${error.message}`);
      }
    }

    if (!reply) {
      provider = 'built-in-course-guide';
      if (!knowledge && courseId && lessonId) knowledge = await buildContext(req.compatUser, courseId, message, history, { lessonId });
      reply = await builtInCourseGuide({
        user: req.compatUser,
        message,
        courseId,
        knowledge,
      });
    }
    reply = cleanLearnerReply(String(reply || '').trim().slice(0, 6000)) || OUT_OF_SCOPE_REPLY;
    const sources = [];
    res.json({ answer: reply, reply, provider, sources,
      notice: provider === 'built-in-course-guide' ? 'AI is temporarily unavailable. Showing the basic course guide.' : null,
      knowledge: knowledge?.materialsAvailable ? 'course-materials' : 'course-overviews',
    });
  } catch (error) {
    res.status(502).json({ error: 'AI is unavailable right now. Please try again.' });
  }
}

router.post('/chat', requireCompatibleAuth(), handleTutorChat);
module.exports = router;
module.exports.handleTutorChat = handleTutorChat;
