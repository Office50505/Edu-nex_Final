const express = require('express');
const Course = require('../models/Course');
const { protect } = require('../middleware/auth');

const router = express.Router();

const FAL_API_KEY = process.env.FAL_API_KEY || process.env.FAL_KEY || '';
const FAL_OPENROUTER_MODEL = process.env.FAL_OPENROUTER_MODEL || process.env.FAL_GEMINI_MODEL || 'google/gemini-2.5-flash';
const FAL_OPENROUTER_URL = process.env.FAL_OPENROUTER_URL || 'https://fal.run/openrouter/router/openai/v1/chat/completions';
const OUT_OF_SCOPE_REPLY = 'I do not know from the EduNex website or course context I have. I can help with EduNex courses, lessons, study planning, subscriptions, profile, payments, and platform navigation.';

function compactText(value, max = 1200) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function siteContext() {
  return [
    'EduNex AI is an online learning platform for AI-powered courses, practical lessons, course videos, progress tracking, certificates, wishlist, profile settings, payments/subscriptions, and an in-app AI tutor.',
    'Users sign up with a mobile number, verify OTP, complete a profile, choose an avatar, and can optionally add email.',
    'Logged-in users can browse courses, use dashboard/course library/video lessons, manage profile settings, and access subscription/payment flows.',
    'The AI tutor must only answer using EduNex website, account, payment, profile, course, lesson, and study context. It must refuse unrelated general knowledge, news, medical, legal, financial, political, or personal advice.'
  ].join('\n');
}

function courseContextLine(course) {
  const lessons = (Array.isArray(course.videos) ? course.videos : [])
    .slice(0, 8)
    .map((video, index) => `${index + 1}. ${compactText(video.title, 120)}${video.description ? ` - ${compactText(video.description, 220)}` : ''}`)
    .join(' | ');

  return [
    `Course: ${compactText(course.title, 180)}`,
    course.category?.name ? `Category: ${compactText(course.category.name, 80)}` : '',
    course.description ? `Description: ${compactText(course.description, 900)}` : '',
    lessons ? `Lessons: ${lessons}` : '',
  ].filter(Boolean).join('\n');
}

function userContext(user) {
  const preferredName = compactText(user?.fullName || user?.email || user?.mobileNumber, 120);
  if (!preferredName) return '';

  return `Logged-in learner profile: The learner's preferred name is ${preferredName}. If the learner asks about their own name or profile identity, answer from this profile context.`;
}

async function buildContext(user) {
  const courses = await Course.find({ status: 'published' })
    .select('title description videos category')
    .populate('category', 'name title')
    .sort({ publishedAt: -1, createdAt: -1 })
    .limit(12)
    .lean();

  const courseContext = courses.map(courseContextLine).join('\n\n');
  return `${siteContext()}\n\n${userContext(user)}\n\nPublished EduNex course context:\n${courseContext || 'No published courses are currently available in the database.'}`;
}

function buildSystemPrompt(context, assistantName) {
  const safeAssistantName = compactText(assistantName, 80) || 'Nex AI';
  return [
    `You are ${safeAssistantName}, the EduNex in-app tutor.`,
    `If the user asks your name, say your name is ${safeAssistantName}.`,
    'Answer only from the provided EduNex website and course context.',
    `If the user asks anything outside that context, reply exactly: "${OUT_OF_SCOPE_REPLY}"`,
    'Be concise, helpful, and practical. If relevant, mention specific EduNex course or lesson names from context.',
    'Do not invent courses, prices, policies, or facts not present in context.',
    'Use clean formatting: short paragraphs, simple bullet lists when useful, and bold only for labels or important terms.',
    'Do not wrap course names, lesson names, or video names in asterisks or quotation marks unless the asterisks or quotation marks are actually part of the saved title.',
    '',
    'Context:',
    context,
  ].join('\n');
}

function buildUserPrompt(message, pagePath) {
  return [
    `Current page: ${compactText(pagePath, 160) || 'unknown'}`,
    '',
    `User question: ${compactText(message, 2000)}`,
  ].join('\n');
}

function extractChatText(data) {
  if (!data) return '';
  if (typeof data === 'string') return data;
  if (typeof data.output === 'string') return data.output;
  if (typeof data.text === 'string') return data.text;
  if (typeof data.response === 'string') return data.response;
  if (typeof data.answer === 'string') return data.answer;
  if (typeof data.content === 'string') return data.content;
  if (Array.isArray(data.output)) return data.output.map(extractChatText).filter(Boolean).join('\n');

  const choice = data.choices?.[0];
  if (typeof choice?.text === 'string') return choice.text;
  if (typeof choice?.message?.content === 'string') return choice.message.content;
  if (Array.isArray(choice?.message?.content)) {
    return choice.message.content.map((part) => part?.text || '').filter(Boolean).join('\n');
  }

  if (typeof data.message?.content === 'string') return data.message.content;
  if (Array.isArray(data.message?.content)) {
    return data.message.content.map((part) => part?.text || '').filter(Boolean).join('\n');
  }

  return '';
}

async function callFalOpenRouter({ context, message, pagePath, assistantName }) {
  const response = await fetch(FAL_OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Key ${FAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: FAL_OPENROUTER_MODEL,
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(context, assistantName),
        },
        {
          role: 'user',
          content: buildUserPrompt(message, pagePath),
        },
      ],
      temperature: 0.2,
      max_tokens: 450,
    }),
  });

  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const detail = typeof body === 'string' ? body : body?.detail || body?.error || body?.message;
    throw new Error(`fal.ai returned ${response.status}${detail ? `: ${detail}` : ''}`);
  }

  return extractChatText(body);
}

router.post('/chat', protect, async (req, res) => {
  try {
    const message = compactText(req.body.message, 2000);
    const pagePath = compactText(req.body.pagePath, 160);
    const assistantName = compactText(req.body.assistantName, 80);

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!FAL_API_KEY) {
      return res.status(500).json({ error: 'Nex AI is not configured. Set FAL_API_KEY on the backend.' });
    }

    const context = await buildContext(req.user);
    const reply = compactText(await callFalOpenRouter({ context, message, pagePath, assistantName }), 4000) || OUT_OF_SCOPE_REPLY;

    res.json({ reply });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Could not reach Nex AI' });
  }
});

module.exports = router;
