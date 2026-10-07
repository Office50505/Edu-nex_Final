const express = require('express');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const Course = require('../models/Course');
const User = require('../models/User');
const AiTutorSession = require('../models/AiTutorSession');
const AiResponseReport = require('../models/AiResponseReport');
const { requireCompatibleAuth } = require('../middleware/compatAuth');
const {
  FAL_API_KEY,
  compactText,
  sanitizeHistory,
  buildContext,
  callFalOpenRouter,
  builtInCourseGuide,
  cleanLearnerReply,
  aiFilmmakingDirectReply,
  resolveRequestedCourseScope,
  resolveConversationState,
  aiFilmmakingTemplateIdForReply,
  OUT_OF_SCOPE_REPLY,
} = require('../services/aiTutorService');
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

function aiMessageRecord(role, content) {
  return {
    role,
    content: compactText(content, 4000),
    createdAt: Date.now(),
  };
}

async function loadTutorState(req, courseId) {
  const userId = req.compatAuth?.userId;
  if (!userId) return null;
  if (typeof AiTutorSession.findOne !== 'function') return null;
  const course = mongoose.Types.ObjectId.isValid(courseId) ? courseId : null;
  return AiTutorSession.findOne({ user: userId, course })
    .select('activeCourseId currentTopic currentIntent lastWorkflow lastTemplateId')
    .lean()
    .catch(() => null);
}

async function persistTutorChat(req, courseId, history, message, reply, state = {}) {
  const userId = req.compatAuth?.userId;
  if (!userId) return;
  const course = mongoose.Types.ObjectId.isValid(courseId) ? courseId : null;
  const conversationId = compactText(req.body?.conversationId || req.body?.conversation_id, 120);
  const messages = [
    ...sanitizeHistory(history).map((item) => aiMessageRecord(item.role, item.content)),
    aiMessageRecord('user', message),
    aiMessageRecord('assistant', reply),
  ].filter((item) => item.content).slice(-40);
  await AiTutorSession.findOneAndUpdate(
    { user: userId, course },
    {
      user: userId,
      course,
      conversationId,
      activeCourseId: compactText(state.activeCourseId, 120),
      currentTopic: compactText(state.currentTopic, 80),
      currentIntent: compactText(state.currentIntent, 80),
      lastWorkflow: compactText(state.lastWorkflow, 120),
      lastTemplateId: compactText(state.lastTemplateId, 160),
      messages,
      lastUpdatedAt: new Date(),
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

function aiDebugPayload({ req, requestedCourseId, resolvedCourseId, state, knowledge, selectedTemplateId, provider }) {
  const chunks = Array.isArray(knowledge?.debugChunks) ? knowledge.debugChunks : [];
  return {
    conversation_id: compactText(req.body?.conversationId || req.body?.conversation_id, 120),
    request_active_course_id: requestedCourseId || '',
    resolved_active_course_id: knowledge?.activeCourse?.id || resolvedCourseId || '',
    current_topic: state?.currentTopic || '',
    current_intent: state?.currentIntent || '',
    rewritten_retrieval_query: knowledge?.retrievalQuery || compactText(req.body?.message, 220),
    retrieved_chunk_ids: chunks.map(chunk => `${chunk.courseSlug || chunk.courseId}:${chunk.section}`).slice(0, 8),
    retrieved_course_ids: [...new Set(chunks.map(chunk => chunk.courseId).filter(Boolean))],
    retrieved_course_names: [...new Set(chunks.map(chunk => chunk.courseName).filter(Boolean))],
    scores_ranks: chunks.map(chunk => ({ rank: chunk.rank, score: Number(chunk.score || 0).toFixed(4), course_id: chunk.courseId, section: chunk.section })).slice(0, 8),
    selected_exact_prompt_template_id: selectedTemplateId || '',
    provider_model_path: provider === 'fal-openrouter' ? 'fal-openrouter' : provider,
  };
}

function logAiDebug(payload) {
  console.info('[nex-ai-debug]', JSON.stringify(payload));
}

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
  const granted = req.body?.granted === true;
  const decision = {
    aiConsentGranted: granted,
    aiConsentPolicyVersion: granted ? AI_CONSENT_POLICY_VERSION : null,
    aiConsentProviderVersion: granted ? AI_PROVIDER_VERSION : null,
    aiConsentDecidedAt: new Date(),
  };
  await User.updateOne({ _id: req.compatAuth.userId }, { $set: decision });
  res.set('Cache-Control', 'no-store');
  res.json({
    granted,
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
    if (!consentIsCurrent(req.compatUser)) {
      return res.status(403).json({
        error: 'Allow third-party AI processing before using Nex AI.',
        code: 'AI_CONSENT_REQUIRED',
        recoverable: true,
        policyVersion: AI_CONSENT_POLICY_VERSION,
        providerVersion: AI_PROVIDER_VERSION,
        providerNames: PROVIDER_NAMES,
      });
    }
    const inputCheck = checkAiInput(req.body?.message);
    if (!inputCheck.ok && !inputCheck.blocked) {
      return res.status(inputCheck.statusCode).json({ error: inputCheck.error });
    }
    const message = inputCheck.message || '';
    const pagePath = compactText(req.body.pagePath, 160).split(/[?#]/)[0];
    const assistantName = compactText(req.body.assistantName, 80);
    const requestedCourseId = compactText(
      req.body.courseId
      || req.body.activeCourseId
      || req.body.active_course_id
      || req.body.activeCourse?._id
      || req.body.activeCourse?.id
      || req.body.activeCourse?.slug,
      120
    );
    const lessonId = compactText(req.body.lessonId, 120);
    const history = sanitizeHistory(req.body.history);
    const savedState = await loadTutorState(req, requestedCourseId);
    const courseId = resolveRequestedCourseScope({
      courseId: req.body.courseId,
      activeCourseId: req.body.activeCourseId || req.body.active_course_id,
      activeCourse: req.body.activeCourse,
      message,
      history,
      savedState,
    });

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
    let selectedTemplateId = '';
    let state = null;
    if (FAL_API_KEY) {
      try {
        knowledge = await buildContext(req.compatUser, courseId, message, history, { lessonId });
        reply = aiFilmmakingDirectReply({ message, courseId, knowledge, history });
        if (reply) {
          provider = 'course-knowledge-rule';
          selectedTemplateId = aiFilmmakingTemplateIdForReply(reply);
        } else {
          reply = await callFalOpenRouter({ context: knowledge.context, message, pagePath, assistantName, history });
          provider = 'fal-openrouter';
        }
      } catch (error) {
        console.warn(`Nex AI provider unavailable; using built-in course guide (${error.name || 'provider-error'})`);
      }
    }

    if (!reply) {
      provider = 'built-in-course-guide';
      if (!knowledge && courseId && lessonId) knowledge = await buildContext(req.compatUser, courseId, message, history, { lessonId });
      reply = aiFilmmakingDirectReply({ message, courseId, knowledge, history });
      if (reply) {
        provider = 'course-knowledge-rule';
        selectedTemplateId = aiFilmmakingTemplateIdForReply(reply);
      } else {
        reply = await builtInCourseGuide({
          user: req.compatUser,
          message,
          courseId,
          knowledge,
        });
      }
    }
    reply = sanitizeAiOutput(cleanLearnerReply(String(reply || '').trim().slice(0, 6000))) || OUT_OF_SCOPE_REPLY;
    state = resolveConversationState({ message, history, knowledge, savedState, selectedTemplateId });
    const debugPayload = aiDebugPayload({ req, requestedCourseId, resolvedCourseId: courseId, state, knowledge, selectedTemplateId, provider });
    logAiDebug(debugPayload);
    await persistTutorChat(req, courseId, history, message, reply, state).catch(() => {});
    const sources = [];
    res.json({ answer: reply, reply, provider, sources, messageId: crypto.randomUUID(),
      notice: null,
      knowledge: knowledge?.materialsAvailable ? 'course-materials' : 'course-overviews',
      ...(req.body?.debugAi ? { debug: debugPayload } : {}),
    });
  } catch (error) {
    res.status(502).json({ error: 'AI is unavailable right now. Please try again.' });
  }
}

router.post('/chat', requireCompatibleAuth({ userProjection: AI_USER_PROJECTION }), aiRateLimit, handleTutorChat);
module.exports = router;
module.exports.handleTutorChat = handleTutorChat;
