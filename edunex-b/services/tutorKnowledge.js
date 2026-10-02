const fs = require('node:fs');
const path = require('node:path');

const COURSE_DOCUMENTS = [
  {
    slugs: ['ai-influencer-course', 'ai-influencer'],
    dir: 'ai-influencer',
    files: [
      ['notes.txt', 'AI Influencer — Notes and Prompts'],
      ['lessons.txt', 'AI Influencer — Master Lessons'],
      ['troubleshooting.txt', 'AI Influencer — Troubleshooting'],
    ],
  },
  {
    slugs: ['ai-filmmaking-course', 'ai-filmmaking'],
    dir: 'ai-filmmaking',
    files: [
      ['training.txt', 'AI Filmmaking — Chatbot Training Knowledge Base'],
    ],
  },
];
const DOCUMENTED_COURSE_SLUGS = new Set(COURSE_DOCUMENTS.flatMap(course => course.slugs));
const STOP = new Set('the a an and or of to in is it for with my me how what why can do does please explain give tell about that this more elaborate simple simply you your hai ka ki ke ko se mein mujhe kya kaise'.split(' '));
const SYNONYMS = [
  ['face', 'identity', 'chehra', 'consistency', 'drift'],
  ['voice', 'audio', 'awaaz', 'awaz', 'robotic'],
  ['prompt', 'prompting', 'prompts'],
  ['realistic', 'realism', 'plastic', 'natural'],
  ['outfit', 'clothes', 'kapde'],
];
const COURSE_COMPARISON_PATTERN = /\b(compare|comparison|versus|vs\.?|difference|differences|different from|between courses|other courses|another course|alternate course|alternative course)\b/i;

function terms(text) {
  return String(text).toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter(word => word.length > 2 && !STOP.has(word)) || [];
}

function chunks(text) {
  const sections = text.replace(/\r/g, '').split(/(?=^.*\b(?:Lesson|LESSON)\s+\d+\s*[—:–-])/m);
  return sections.flatMap(section => {
    const heading = section.trim().split('\n')[0].slice(0, 160);
    const result = [];
    for (let start = 0; start < section.length; start += 1400) {
      const content = section.slice(start, start + 1800).trim();
      if (content.length > 60) result.push({ heading, content, chunkStart: start });
    }
    return result;
  });
}
const localDocuments = COURSE_DOCUMENTS.flatMap(({ slugs, dir, files }) => files.flatMap(([file, title]) => {
  const text = fs.readFileSync(path.join(__dirname, '../knowledge', dir, file), 'utf8');
  return slugs.flatMap(slug => chunks(text).map(chunk => ({ ...chunk, title, courseSlug: slug, kind: 'course-material' })));
}));

function hasLessonAccess(subscription, now = Date.now()) {
  if (!subscription) return false;
  if (['trial', '1rs trial'].includes(subscription.status)) return new Date(subscription.trialExpiresAt).getTime() > now;
  if (['active', 'subscribed'].includes(subscription.status)) return new Date(subscription.currentPeriodEnd).getTime() > now;
  return false;
}

function sameCourse(left, right) {
  if (!left || !right) return false;
  const leftId = left._id != null ? String(left._id) : '';
  const rightId = right._id != null ? String(right._id) : '';
  const leftSlug = String(left.slug || '').toLowerCase();
  const rightSlug = String(right.slug || '').toLowerCase();
  return Boolean((leftId && rightId && leftId === rightId) || (leftSlug && rightSlug && leftSlug === rightSlug));
}

function allowsCourseComparison(message) {
  return COURSE_COMPARISON_PATTERN.test(String(message || ''));
}

function detectsFaceConsistencyRetrieval(message, history = []) {
  const text = [
    message,
    ...(Array.isArray(history) ? history.slice(-6).map(item => item?.content || '') : []),
  ].join('\n').toLowerCase();
  return /\b(face|identity|character|chehra)\b/.test(text)
    && /\b(change|changes|changing|drift|drifts|drifting|different|inconsistent|same|consistent|lock|locked|character sheet|last frame|start frame|ingredients|face-fix|badal|badalta)\b/.test(text);
}

function wantsExactPrompt(message) {
  return /\b(prompt|template)\b/i.test(message)
    || /\bexact\s+(?:line|wording|prompt|template)\b/i.test(message)
    || /\bcopy[-\s]*paste\b/i.test(message);
}

function retrievalQueryFor({ message, history = [], activeCourse = null }) {
  if (activeCourse && detectsFaceConsistencyRetrieval(message, history)) {
    const courseName = String(activeCourse.title || activeCourse.slug || '').trim();
    const exact = wantsExactPrompt(message) ? ' exact prompt template' : '';
    return `${courseName} face consistency Ingredients${exact} using saved last frame and character sheet`;
  }
  return String(message || '');
}

function retrieveKnowledge({ courses, message, history = [], includeMaterials = false, activeLesson = null, activeCourse = null, allowCrossCourse = false }) {
  const scopedToActiveCourse = Boolean(activeCourse && !allowCrossCourse && !allowsCourseComparison(message));
  const retrievalQuery = retrievalQueryFor({ message, history, activeCourse });
  const scopedCourses = scopedToActiveCourse
    ? courses.filter(course => sameCourse(course, activeCourse))
    : courses;
  const searchableCourses = scopedCourses.length ? scopedCourses : (scopedToActiveCourse ? [activeCourse] : courses);
  const bySlug = new Map(searchableCourses.map(course => [course.slug, course]).filter(([slug]) => slug));
  const candidates = searchableCourses.flatMap(course => [
    { title: course.title, heading: 'Course overview', content: `${course.title}\n${course.description || ''}`, course, kind: 'course-overview' },
    ...(course.videos || []).map(video => ({ title: course.title, heading: video.title, content: `${video.title}\n${video.description || ''}${includeMaterials && video.examplePrompt ? `\nExample prompt: ${video.examplePrompt}` : ''}`, course, active: video === activeLesson, kind: 'lesson-overview' })),
  ]);
  const normalizeTitle = value => String(value || '').toLowerCase().replace(/^\s*lesson\s*\d+\s*[—:–-]?\s*/i, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const lessonNumber = String(activeLesson?.title || '').match(/^\s*lesson\s+(\d+)\b/i)?.[1];
  if (includeMaterials) {
    if (activeLesson?.notes && activeCourse) candidates.push({
      title: activeCourse.title, heading: `${activeLesson.title} — Lesson notes`, content: String(activeLesson.notes).slice(0, 12000),
      course: activeCourse, kind: 'lesson-notes', active: true,
    });
    candidates.push(...localDocuments.filter(doc => bySlug.has(doc.courseSlug)).map(doc => ({ ...doc, course: bySlug.get(doc.courseSlug),
      active: Boolean(activeLesson && activeCourse?.slug === doc.courseSlug && (
        (lessonNumber && doc.heading.match(/^\s*lesson\s+(\d+)\b/i)?.[1] === lessonNumber)
        || normalizeTitle(doc.heading) === normalizeTitle(activeLesson.title)
      )),
    })));
  }

  // Short follow-ups need the preceding topic; an explicit new question takes priority.
  const currentTerms = terms(retrievalQuery);
  const followUp = currentTerms.length < 3 || /\b(that|this|same|previous|example|simpler|elaborate|continue|quiz|samjhao)\b/i.test(message);
  const recent = followUp ? history.slice(-4).map(item => item.content).join(' ') : '';
  const weights = new Map();
  for (const word of terms(recent)) weights.set(word, 0.3);
  for (const word of currentTerms) weights.set(word, 1);
  for (const group of SYNONYMS) {
    if (group.some(word => weights.has(word))) for (const word of group) if (!weights.has(word)) weights.set(word, 0.45);
  }
  const indexed = candidates.map(candidate => ({ ...candidate, tokens: terms(`${candidate.heading} ${candidate.content}`) }));
  const frequencies = new Map();
  for (const doc of indexed) for (const term of new Set(doc.tokens)) frequencies.set(term, (frequencies.get(term) || 0) + 1);
  const ranked = indexed.map(doc => {
    let score = doc.active ? (doc.kind === 'lesson-notes' ? 120 : 100) : 0;
    const counts = new Map();
    for (const term of doc.tokens) counts.set(term, (counts.get(term) || 0) + 1);
    for (const [word, weight] of weights) {
      const count = counts.get(word) || 0;
      if (count) score += weight * Math.log(1 + indexed.length / (frequencies.get(word) || 1)) * count / (count + 1.2 + doc.tokens.length / 200);
    }
    return { ...doc, score };
  }).filter(doc => doc.score > 0).sort((a, b) => b.score - a.score);

  const selected = [];
  const seen = new Set();
  for (const doc of ranked) {
    const key = `${doc.title}:${doc.heading}${doc.active ? `:${doc.chunkStart || 0}` : ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(doc);
    if (selected.length === 6) break;
  }
  const sources = selected.map((doc, index) => ({
    id: `S${index + 1}`, title: doc.title, section: doc.heading, kind: doc.kind,
    courseId: String(doc.course._id), url: `/course-details.html?id=${encodeURIComponent(doc.course._id)}`,
  }));
  return {
    sources,
    excerpts: selected.map((doc, index) => `[${sources[index].id}] ${doc.title} — ${doc.heading} (${doc.kind})\n${doc.content}`).join('\n\n'),
    bestExcerpt: selected[0]?.content || '',
    materialsAvailable: includeMaterials && ([...DOCUMENTED_COURSE_SLUGS].some(slug => bySlug.has(slug)) || Boolean(activeLesson?.notes)),
    courseScoped: scopedToActiveCourse,
    retrievalQuery,
    debugChunks: selected.map((doc, index) => ({
      rank: index + 1,
      courseId: String(doc.course._id),
      courseSlug: String(doc.course.slug || ''),
      courseName: String(doc.course.title || ''),
      section: doc.heading,
      kind: doc.kind,
      score: Number(doc.score || 0),
    })),
    activeCourse: activeCourse ? { title: activeCourse.title, slug: activeCourse.slug, id: String(activeCourse._id || '') } : null,
    activeLesson: activeLesson ? { title: activeLesson.title, description: activeLesson.description || '' } : null,
    activeLessonExcerpt: selected.filter(doc => doc.active).map(doc => `[${sources[selected.indexOf(doc)].id}] ${doc.content}`).join('\n\n'),
  };
}

module.exports = { retrieveKnowledge, hasLessonAccess, allowsCourseComparison };
