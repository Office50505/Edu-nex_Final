const express = require('express');
const crypto = require('node:crypto');
const Course = require('../models/Course');
const User = require('../models/User');
const AiTutorSession = require('../models/AiTutorSession');
const AiResponseReport = require('../models/AiResponseReport');
const { requireCompatibleAuth } = require('../middleware/compatAuth');
const { FAL_API_KEY, compactText, sanitizeHistory, buildContext, callFalOpenRouter, builtInCourseGuide, cleanLearnerReply, OUT_OF_SCOPE_REPLY } = require('../services/aiTutorService');
const {
  AI_CONSENT_POLICY_VERSION,
  AI_PROVIDER_VERSION,
  PROVIDER_NAMES,
  checkAiInput,
  consentIsCurrent,
  responseHash,
  sanitizeAiOutput,
} = require('../services/aiCompliance');
const router = express.Router();
const AI_USER_PROJECTION = '+activeSessionId +activeSessions +aiConsentGranted +aiConsentPolicyVersion +aiConsentProviderVersion +aiConsentDecidedAt';
const aiRateState = new Map();

function aiRateLimit(req, res, next) {
  const key = String(req.compatAuth?.userId || req.ip);
  const now = Date.now();
  const current = aiRateState.get(key);
  if (!current || current.resetAt <= now) {
    aiRateState.set(key, { count: 1, resetAt: now + 60_000 });
    return next();
  }
  current.count += 1;
  if (current.count > 30) return res.status(429).json({ error: 'Too many AI requests. Wait a minute and try again.' });
  return next();
}

router.get('/consent', requireCompatibleAuth({ userProjection: AI_USER_PROJECTION }), (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    granted: consentIsCurrent(req.compatUser),
    policyVersion: AI_CONSENT_POLICY_VERSION,
    providerVersion: AI_PROVIDER_VERSION,
    providerNames: PROVIDER_NAMES,
    decidedAt: req.compatUser.aiConsentDecidedAt || null,
    transmittedData: ['your question', 'up to 12 recent chat messages', 'relevant course and lesson context'],
  });
});

router.put('/consent', requireCompatibleAuth({ userProjection: AI_USER_PROJECTION }), async (req, res) => {
  if (typeof req.body?.granted !== 'boolean') return res.status(400).json({ error: 'Choose a valid AI data preference.' });
  const decision = {
    aiConsentGranted: req.body.granted,
    aiConsentPolicyVersion: AI_CONSENT_POLICY_VERSION,
    aiConsentProviderVersion: AI_PROVIDER_VERSION,
    aiConsentDecidedAt: new Date(),
  };
  await User.updateOne({ _id: req.compatAuth.userId }, { $set: decision });
  res.set('Cache-Control', 'no-store');
  res.json({
    granted: req.body.granted,
    policyVersion: AI_CONSENT_POLICY_VERSION,
    providerVersion: AI_PROVIDER_VERSION,
    providerNames: PROVIDER_NAMES,
    decidedAt: decision.aiConsentDecidedAt,
  });
});

router.delete('/history', requireCompatibleAuth({ userProjection: AI_USER_PROJECTION }), async (req, res) => {
  const result = await AiTutorSession.deleteMany({ user: req.compatAuth.userId });
  res.json({ success: true, deletedCount: result.deletedCount || 0 });
});

router.post('/reports', requireCompatibleAuth({ userProjection: AI_USER_PROJECTION }), async (req, res) => {
  const allowedReasons = new Set(['incorrect', 'harmful_or_unsafe', 'inappropriate', 'privacy_concern', 'other']);
  const messageId = compactText(req.body?.messageId, 120);
  const reason = compactText(req.body?.reason, 40);
  if (!messageId || !allowedReasons.has(reason)) return res.status(400).json({ error: 'Choose a valid report reason.' });
  try {
    await AiResponseReport.create({
      user: req.compatAuth.userId,
      messageId,
      reason,
      responseHash: req.body?.response ? responseHash(String(req.body.response).slice(0, 6000)) : null,
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }
  res.status(201).json({ success: true, message: 'Thanks. The response was reported for review.' });
});

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
    res.status(500).json({ error: 'Could not load Nex AI courses' });
  }
});

async function handleTutorChat(req, res) {
  try {
    const inputCheck = checkAiInput(req.body?.message);
    if (!inputCheck.ok && !inputCheck.blocked) {
      return res.status(inputCheck.statusCode).json({ error: inputCheck.error });
    }
    const message = inputCheck.message || '';
    const pagePath = compactText(req.body.pagePath, 160).split(/[?#]/)[0];
    const assistantName = compactText(req.body.assistantName, 80);
    const courseId = compactText(req.body.courseId, 120);
    const lessonId = compactText(req.body.lessonId, 120);
    const history = sanitizeHistory(req.body.history);

    if (inputCheck.blocked) {
      return res.json({
        answer: inputCheck.reply,
        reply: inputCheck.reply,
        messageId: crypto.randomUUID(),
        provider: 'safety-filter',
        sources: [],
      });
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
        console.warn(`Nex AI provider unavailable; using built-in course guide (${error.name || 'provider-error'})`);
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
    reply = sanitizeAiOutput(cleanLearnerReply(String(reply || '').trim().slice(0, 6000))) || OUT_OF_SCOPE_REPLY;
    const sources = [];
    res.json({ answer: reply, reply, provider, sources, messageId: crypto.randomUUID(),
      notice: null,
      knowledge: knowledge?.materialsAvailable ? 'course-materials' : 'course-overviews',
    });
  } catch (error) {
    res.status(502).json({ error: 'AI is unavailable right now. Please try again.' });
  }
}

router.post('/chat', requireCompatibleAuth({ userProjection: AI_USER_PROJECTION }), aiRateLimit, handleTutorChat);
module.exports = router;
module.exports.handleTutorChat = handleTutorChat;
