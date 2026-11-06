const fs = require('node:fs');
const path = require('node:path');
const { PRODUCT_SLUGS, PRODUCT_RECORDS, findProductTemplate, wantsProductPrompt, productRequestContext } = require('./productTutorKnowledge');

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
    slugs: ['ai-filmmaking-course', 'ai-filmmaking', 'ai_filmmaking'],
    dir: 'ai-filmmaking',
    files: [
      ['training.txt', 'AI Filmmaking — Chatbot Training Knowledge Base'],
      ['training-l9-15.txt', 'AI Filmmaking — Chatbot Training Knowledge Base L9-15'],
    ],
  },
  {
    slugs: [
      'ai-product-photoshoot-ads-course',
      'ai-product-photoshoot-ads',
      'ai-product-photoshoot-and-ads',
      'ai-product-photoshoot',
      'ai-product-ads',
      'ai_product_photoshoot_ads',
    ],
    dir: 'ai-product-photoshoot-ads',
    files: [
      ['training.txt', 'AI Product Photoshoot & Ads — Chatbot Transcript'],
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
  ['product', 'photoshoot', 'photo', 'photos', 'ads', 'ad'],
  ['sheet', 'reference', 'ingredients'],
  ['ugc', 'review', 'testimonial', 'customer'],
  ['colour', 'color', 'rang'],
  ['morphing', 'morph', 'pighal', 'warping'],
  ['label', 'logo', 'text', 'letters'],
];
const COURSE_COMPARISON_PATTERN = /\b(compare|comparison|versus|vs\.?|difference|differences|different from|between courses|other courses|another course|alternate course|alternative course)\b/i;

function terms(text) {
  return String(text).toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter(word => word.length > 2 && !STOP.has(word)) || [];
}

function lessonMetadata(heading) {
  const match = String(heading || '').match(/\b(?:Lesson|LESSON)\s+(\d+)\s*[—:–-]\s*(.+)?$/)
    || String(heading || '').match(/^\s*L(\d{1,2})\s+(.+)?$/i);
  if (!match) return { lessonId: '', lessonNumber: null, lessonName: '' };
  const lessonNumber = Number(match[1]);
  return {
    lessonId: `lesson_${lessonNumber}`,
    lessonNumber,
    lessonName: String(match[2] || '').trim(),
  };
}

function chunks(text) {
  const sections = text.replace(/\r/g, '').split(/(?=^.*\b(?:Lesson|LESSON)\s+\d+\s*[—:–-]|^\s*L\d{1,2}\s+.+$)/m);
  return sections.flatMap(section => {
    const heading = section.trim().split('\n')[0].slice(0, 160);
    const metadata = lessonMetadata(heading);
    const result = [];
    for (let start = 0; start < section.length; start += 1400) {
      const content = section.slice(start, start + 1800).trim();
      if (content.length > 60) result.push({ heading, content, chunkStart: start, ...metadata });
    }
    return result;
  });
}
const PLATFORM_DOC_PATH = path.join(__dirname, '../knowledge/platform/skillomate-platform.txt');
const PLATFORM_DOCUMENTS = fs.existsSync(PLATFORM_DOC_PATH)
  ? chunks(fs.readFileSync(PLATFORM_DOC_PATH, 'utf8')).map(chunk => ({
      ...chunk,
      title: 'Skillomate Platform Knowledge Base',
      kind: 'platform-material',
    }))
  : [];
const localDocuments = COURSE_DOCUMENTS.flatMap(({ slugs, dir, files }) => files.flatMap(([file, title]) => {
  const text = fs.readFileSync(path.join(__dirname, '../knowledge', dir, file), 'utf8');
  return slugs.flatMap(slug => (PRODUCT_SLUGS.has(slug) ? PRODUCT_RECORDS : chunks(text)).map(chunk => ({
    ...chunk,
    title,
    courseSlug: slug,
    kind: 'course-material',
    contentType: chunk.contentType || 'course-material',
    sourceDocument: file,
  })));
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
  return /\bexact\s+(?:line|wording|prompt|template|sentence)\b/i.test(message)
    || /\bcopy[-\s]*paste\b/i.test(message);
}

function detectsRealismRetrieval(message, history = []) {
  const current = String(message || '').toLowerCase();
  const recent = (Array.isArray(history) ? history.slice(-6).map(item => item?.content || '').join('\n') : '').toLowerCase();
  const hasRealismTopic = text => /\b(?:fake|plastic|realism|realistic|ai\s*look|waxy|smoothed|smooth\s+skin|8k|ultra|hyper[-\s]*detailed|candid|iphone)\b/.test(text)
    && /\b(?:video|clip|look|looks?|prompt|likhu|write|fix|change|avoid|skin|camera|rha|lag)\b/.test(text);
  const followUp = /\b(?:what\s+should\s+i\s+avoid|avoid\s+exactly|what\s+about\s+that|what\s+should\s+i\s+use\s+instead|give\s+me\s+more\s+details|more\s+details|elaborate|explain\s+that|continue|same\s+topic|aur\s+batao|details\s+do)\b/.test(current);
  return hasRealismTopic(current) || (followUp && hasRealismTopic(recent));
}

function isAiFilmmakingCourse(course) {
  const slug = String(course?.slug || '').toLowerCase();
  const title = String(course?.title || '').toLowerCase();
  return ['ai-filmmaking-course', 'ai-filmmaking', 'ai_filmmaking'].includes(slug)
    || /\bai\s*filmmaking\b|\bai\s*film\s*making\b/.test(title);
}

function retrievalQueryFor({ message, history = [], activeCourse = null }) {
  if (activeCourse && !PRODUCT_SLUGS.has(activeCourse.slug) && detectsFaceConsistencyRetrieval(message, history)) {
    const courseName = String(activeCourse.title || activeCourse.slug || '').trim();
    const exact = wantsExactPrompt(message) ? ' exact prompt template' : '';
    return `${courseName} face consistency Ingredients${exact} using saved last frame and character sheet`;
  }
  if (activeCourse && isAiFilmmakingCourse(activeCourse) && detectsRealismRetrieval(message, history)) {
    const courseName = String(activeCourse.title || activeCourse.slug || '').trim();
    return `${courseName} Lesson 11 realism fake plastic AI look avoid 8K ultra real skin pores beauty filter heavy colour grade slow motion over-perfect posed RAW candid iPhone`;
  }
  return String(message || '');
}

function requestedLessonNumberFromText(value) {
  const match = String(value || '').match(/\b(?:lesson|l)\s*0?(\d{1,2})\b/i);
  return match ? Number(match[1]) : null;
}

function retrieveKnowledge({ courses, message, history = [], includeMaterials = false, activeLesson = null, activeCourse = null, allowCrossCourse = false, conversationContext = {} }) {
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
  const productScope = PRODUCT_SLUGS.has(String(activeCourse?.slug || (courses.length === 1 ? courses[0]?.slug : '')));
  const requestContext = productScope ? productRequestContext(message, history, { ...conversationContext,
    lessonNumber: requestedLessonNumberFromText(activeLesson?.title) || conversationContext.lessonNumber }) : null;
  const requestedLessonNumber = requestContext?.lessonNumber || requestedLessonNumberFromText(`${message}\n${retrievalQuery}`);
  const followUp = currentTerms.length < 3 || /\b(that|this|same|previous|example|simpler|elaborate|continue|quiz|samjhao|bhi|iska|uska|then|now)\b|तो|उसका|इसका/i.test(message);
  // User turns carry product facts; assistant prose must not invent a new retrieval entity.
  const recent = followUp ? (productScope ? history.filter(item => item.role === 'user').slice(-2) : history.slice(-4)).map(item => item.content).join(' ') : '';
  const template = productScope && wantsProductPrompt(message) ? findProductTemplate(message, history) : null;
  const workflowIntent = /workflow|steps|settings|references|how (?:do|does|can|to)|तरीका|सेटिंग|kaise|tareeka/i.test(message);
  const weights = new Map();
  for (const word of terms(recent)) weights.set(word, 0.3);
  for (const word of currentTerms) weights.set(word, 1);
  for (const group of SYNONYMS) {
    if (productScope && group.includes('photoshoot')) continue;
    if (group.some(word => weights.has(word))) for (const word of group) if (!weights.has(word)) weights.set(word, 0.45);
  }
  const indexed = candidates.map(candidate => ({ ...candidate, tokens: terms(`${candidate.heading} ${candidate.content} ${candidate.searchTerms || ''} ${candidate.translations?.english || ''}`) }));
  const frequencies = new Map();
  for (const doc of indexed) for (const term of new Set(doc.tokens)) frequencies.set(term, (frequencies.get(term) || 0) + 1);
  const ranked = indexed.map(doc => {
    const candidateLesson=doc.lessonNumber || requestedLessonNumberFromText(doc.heading);
    const contradictsExplicitLesson=productScope && requestContext.explicitLesson && candidateLesson && candidateLesson!==requestedLessonNumber;
    let score = doc.active && !contradictsExplicitLesson ? (doc.kind === 'lesson-notes' ? 120 : 100) : 0;
    const lessonMatches = requestedLessonNumber && (doc.lessonNumber === requestedLessonNumber || doc.lessonNumbers?.includes(requestedLessonNumber));
    if (lessonMatches) score += 30;
    if (productScope && requestContext.topic && doc.intentTags?.includes(requestContext.topic)) score += 55;
    if (productScope && requestContext.topic==='festive' && doc.lessonNumber===4
      && doc.contentType==='exact-template' && /Diwali|Wedding Gift/.test(doc.heading)) score += 90;
    if (productScope && requestContext.explicitLesson && doc.lessonNumber && !lessonMatches) score -= 35;
    if (productScope && doc.contentType === 'workflow' && workflowIntent) score += lessonMatches ? 15 : 1;
    // Creative image requests need the complete authorized scene assets, not invented scene facts.
    if (productScope && (requestContext.requestedOutputs.includes('prompts') || requestContext.requestedOutputs.includes('composition')) && !template && doc.contentType === 'exact-template'
      && doc.lessonNumber === 2 && /White Studio|Lifestyle|Dark Premium/.test(doc.heading)) score += 90;
    if(productScope && (requestContext.compound || requestContext.wholeJourney)) {
      const needed=requestContext.wholeJourney?['product_sheet','ad_plan','video','ugc','final_assembly']:['final_assembly','prompt_location'];
      if(doc.intentTags?.some(tag=>needed.includes(tag)) && (doc.contentType==='workflow'||doc.lessonNumber===8))score+=110;
    }
    if (template && doc.chunkId === template.chunkId) score += 150;
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
    const key = doc.chunkId ? `${doc.course._id}:${doc.chunkId}` : `${doc.title}:${doc.heading}${doc.active ? `:${doc.chunkStart || 0}` : ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(doc);
    if (selected.length === 6) break;
  }
  const sources = selected.map((doc, index) => ({
    id: `S${index + 1}`, title: doc.title, section: doc.heading, kind: doc.kind,
    courseId: String(doc.course._id), url: `/course-details.html?id=${encodeURIComponent(doc.course._id)}`,
    lessonId: doc.lessonId || '',
    lessonName: doc.lessonName || '',
    contentType: doc.contentType || doc.kind,
    sourceDocument: doc.sourceDocument || '',
    chunkId: doc.chunkId || `${doc.course.slug}:${doc.sourceDocument || doc.kind}:${doc.heading}:${doc.chunkStart || 0}`,
  }));
  return {
    sources,
    excerpts: selected.map((doc, index) => `[${sources[index].id}] ${doc.title} — ${doc.heading} (${doc.kind})${doc.lessonId ? ` [Lesson ${String(doc.lessonNumber).padStart(2,'0')}; ${doc.lessonId}]` : ''}\n${doc.content}${doc.translations?.english ? `\nReviewed English translation: ${doc.translations.english}` : ''}`).join('\n\n'),
    records: selected.filter(doc => doc.kind === 'course-material').map(doc => ({ ...doc, course: undefined })),
    bestExcerpt: selected[0]?.content || '',
    materialsAvailable: includeMaterials && ([...DOCUMENTED_COURSE_SLUGS].some(slug => bySlug.has(slug)) || Boolean(activeLesson?.notes)),
    courseScoped: scopedToActiveCourse,
    retrievalQuery,
    ...(requestContext ? { requestContext } : {}),
    debugChunks: selected.map((doc, index) => ({
      rank: index + 1,
      courseId: String(doc.course._id),
      courseSlug: String(doc.course.slug || ''),
      courseName: String(doc.course.title || ''),
      section: doc.heading,
      lessonId: doc.lessonId || '',
      lessonName: doc.lessonName || '',
      contentType: doc.contentType || doc.kind,
      sourceDocument: doc.sourceDocument || '',
      kind: doc.kind,
      chunkId: sources[index].chunkId,
      chunkStart: doc.chunkStart || 0,
      contentHash: doc.contentHash || '',
      sourceHash: doc.sourceHash || '',
      translationHash: doc.translationHash || '',
      score: Number(doc.score || 0),
    })),
    activeCourse: activeCourse ? { title: activeCourse.title, slug: activeCourse.slug, id: String(activeCourse._id || '') } : null,
    activeLesson: activeLesson ? { title: activeLesson.title, description: activeLesson.description || '' } : null,
    activeLessonExcerpt: selected.filter(doc => doc.active).map(doc => `[${sources[selected.indexOf(doc)].id}] ${doc.content}`).join('\n\n'),
  };
}

function retrievePlatformKnowledge({ message, history = [] } = {}) {
  const retrievalQuery = [
    message,
    ...(Array.isArray(history) ? history.slice(-4).map(item => item?.content || '') : []),
  ].join(' ');
  const weights = new Map();
  for (const word of terms(retrievalQuery)) weights.set(word, 1);
  const indexed = PLATFORM_DOCUMENTS.map(doc => ({ ...doc, tokens: terms(`${doc.heading} ${doc.content}`) }));
  const frequencies = new Map();
  for (const doc of indexed) for (const term of new Set(doc.tokens)) frequencies.set(term, (frequencies.get(term) || 0) + 1);
  const ranked = indexed.map(doc => {
    let score = 0;
    const counts = new Map();
    for (const term of doc.tokens) counts.set(term, (counts.get(term) || 0) + 1);
    for (const [word, weight] of weights) {
      const count = counts.get(word) || 0;
      if (count) score += weight * Math.log(1 + indexed.length / (frequencies.get(word) || 1)) * count / (count + 1.2 + doc.tokens.length / 200);
    }
    return { ...doc, score };
  }).filter(doc => doc.score > 0).sort((a, b) => b.score - a.score).slice(0, 4);

  return {
    excerpts: ranked.map((doc, index) => `[P${index + 1}] ${doc.title} — ${doc.heading || 'Platform reference'}\n${doc.content}`).join('\n\n'),
    debugChunks: ranked.map((doc, index) => ({ rank: index + 1, section: doc.heading, kind: doc.kind, score: Number(doc.score || 0) })),
    available: PLATFORM_DOCUMENTS.length > 0,
  };
}

module.exports = { retrieveKnowledge, retrievePlatformKnowledge, hasLessonAccess, allowsCourseComparison };
