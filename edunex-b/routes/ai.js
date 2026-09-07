const express = require('express');
const Course = require('../models/Course');
const { requireCompatibleAuth } = require('../middleware/compatAuth');

const router = express.Router();

const FAL_API_KEY = process.env.FAL_API_KEY || process.env.FAL_KEY || '';
const FAL_OPENROUTER_MODEL = process.env.FAL_OPENROUTER_MODEL || process.env.FAL_GEMINI_MODEL || 'google/gemini-2.5-flash';
const FAL_OPENROUTER_URL = process.env.FAL_OPENROUTER_URL || 'https://fal.run/openrouter/router/openai/v1/chat/completions';
const OUT_OF_SCOPE_REPLY = 'I do not know from the Skillomate website or course context I have. I can help with Skillomate courses, lessons, study planning, subscriptions, profile, payments, and platform navigation.';
const OUT_OF_SCOPE_TOPIC_PATTERN = /\b(weather|forecast|breaking news|medical|diagnosis|legal advice|lawyer|election|politics|stock tip|crypto|bitcoin|sports?|cricket|football)\b/i;
const COURSE_GUIDE_STOP_WORDS = new Set([
  'about', 'anything', 'can', 'course', 'courses', 'could', 'explain', 'from', 'give', 'have', 'learn',
  'lesson', 'one', 'please', 'quick', 'should', 'simply', 'summarize', 'tell',
  'that', 'this', 'what', 'when', 'where', 'which', 'who', 'with', 'won', 'would',
  'your',
]);

function compactText(value, max = 1200) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function siteContext() {
  return [
    'Skillomate AI is an online learning platform for AI-powered courses, practical lessons, course videos, progress tracking, certificates, wishlist, profile settings, payments/subscriptions, and an in-app AI tutor.',
    'Users sign up with a mobile number, verify OTP, complete a profile, choose an avatar, and can optionally add email.',
    'Logged-in users can browse courses, use dashboard/course library/video lessons, manage profile settings, and access subscription/payment flows.',
    'The AI tutor must only answer using Skillomate website, account, payment, profile, course, lesson, and study context. It must refuse unrelated general knowledge, news, medical, legal, financial, political, or personal advice.'
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

async function buildContext(user, courseId) {
  const courseQuery = { status: 'published' };
  if (courseId) {
    if (/^[a-f\d]{24}$/i.test(courseId)) {
      courseQuery._id = courseId;
    } else {
      courseQuery.slug = courseId;
    }
  }

  const courses = await Course.find(courseQuery)
    .select('title description videos category')
    .populate('category', 'name title')
    .sort({ publishedAt: -1, createdAt: -1 })
    .limit(12)
    .lean();

  const courseContext = courses.map(courseContextLine).join('\n\n');
  return `${siteContext()}\n\n${userContext(user)}\n\nPublished Skillomate course context:\n${courseContext || 'No published courses are currently available in the database.'}`;
}

function significantWords(value) {
  return compactText(value, 2000)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(word => word.length > 2 && !COURSE_GUIDE_STOP_WORDS.has(word));
}

function localCourseSummary(course) {
  const lessons = (Array.isArray(course.videos) ? course.videos : [])
    .slice(0, 4)
    .map(video => compactText(video.title, 120))
    .filter(Boolean);
  const description = compactText(course.description, 360);
  return `${course.title}${description ? `: ${description}` : ''}${lessons.length ? ` Lessons include ${lessons.join(', ')}.` : ''}`;
}

async function builtInCourseGuide({ user, message, courseId }) {
  const query = { status: 'published' };
  if (courseId) {
    if (/^[a-f\d]{24}$/i.test(courseId)) query._id = courseId;
    else query.slug = courseId;
  }

  const courses = await Course.find(query)
    .select('title description videos.title')
    .sort({ publishedAt: -1, createdAt: -1 })
    .limit(12)
    .lean();

  if (!courses.length) {
    return courseId
      ? 'This course does not have published AI content yet.'
      : 'No published courses are currently available in Skillomate.';
  }

  const normalizedMessage = message.toLowerCase();
  if (/\b(my name|who am i|my profile)\b/.test(normalizedMessage)) {
    const preferredName = compactText(user?.fullName || user?.email || user?.mobileNumber, 120);
    return preferredName
      ? `Your Skillomate profile name is ${preferredName}.`
      : 'Your Skillomate profile does not have a display name yet.';
  }

  const courseDiscoveryIntent = /\b(courses?|catalog|available|recommend|study|learning|learn|teach)\b/.test(normalizedMessage);
  if (OUT_OF_SCOPE_TOPIC_PATTERN.test(message) && !courseDiscoveryIntent) {
    return OUT_OF_SCOPE_REPLY;
  }

  const words = significantWords(message);
  const ranked = courses
    .map(course => {
      const searchable = new Set(significantWords([
        course.title,
        course.description,
        ...(Array.isArray(course.videos) ? course.videos.map(video => video.title) : []),
      ].join(' ')));
      const score = words.reduce((total, word) => total + (searchable.has(word) ? 1 : 0), 0);
      return { course, score };
    })
    .sort((a, b) => b.score - a.score);
  const minimumScore = Math.max(words.length, 1);
  const bestMatch = ranked[0]?.score >= minimumScore ? ranked[0].course : null;

  if (/\b(quiz|questions|practice|test me)\b/.test(normalizedMessage)) {
    const course = bestMatch || courses[0];
    const lesson = compactText(course.videos?.[0]?.title, 120);
    return `Quick quiz for ${course.title}: 1. What is the course's main goal? 2. ${lesson ? `What are the key ideas in ${lesson}?` : 'Which concept would you apply first?'} 3. How would you use one idea from this course in a practical project?`;
  }

  if (bestMatch) return localCourseSummary(bestMatch);
  if (courseId) return localCourseSummary(courses[0]);

  if (courseDiscoveryIntent) {
    return `Published Skillomate courses: ${courses.slice(0, 5).map(course => course.title).join(', ')}. Ask about a course name for its description and lessons.`;
  }

  if (/\b(edunex|subscription|payment|profile|certificate|wishlist|download|navigate|navigation|account)\b/.test(normalizedMessage)) {
    return 'Skillomate supports published courses and lessons, progress tracking, certificates, wishlists, downloads, profile settings, and subscription or payment flows.';
  }

  return OUT_OF_SCOPE_REPLY;
}

function buildSystemPrompt(context, assistantName) {
  const safeAssistantName = compactText(assistantName, 80) || 'Nex AI';
  return [
    `You are ${safeAssistantName}, the Skillomate in-app tutor.`,
    `If the user asks your name, say your name is ${safeAssistantName}.`,
    'Answer only from the provided Skillomate website and course context.',
    `If the user asks anything outside that context, reply exactly: "${OUT_OF_SCOPE_REPLY}"`,
    'Be concise, helpful, and practical. If relevant, mention specific Skillomate course or lesson names from context.',
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

router.post('/chat', requireCompatibleAuth(), async (req, res) => {
  try {
    const message = compactText(req.body.message, 2000);
    const pagePath = compactText(req.body.pagePath, 160);
    const assistantName = compactText(req.body.assistantName, 80);
    const courseId = compactText(req.body.courseId, 120);

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    let provider = 'built-in-course-guide';
    let reply;
    if (FAL_API_KEY) {
      try {
        const context = await buildContext(req.compatUser, courseId);
        reply = await callFalOpenRouter({ context, message, pagePath, assistantName });
        provider = 'fal-openrouter';
      } catch (error) {
        console.warn(`Nex AI provider unavailable; using built-in course guide: ${error.message}`);
      }
    }

    if (!reply) {
      reply = await builtInCourseGuide({
        user: req.compatUser,
        message,
        courseId,
      });
    }
    reply = compactText(reply, 4000) || OUT_OF_SCOPE_REPLY;

    res.json({ answer: reply, reply, provider });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Could not reach Nex AI' });
  }
});

module.exports = router;
