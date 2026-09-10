const fs = require('node:fs');
const path = require('node:path');

const DOCUMENTS = [
  ['notes.txt', 'AI Influencer — Notes and Prompts'],
  ['lessons.txt', 'AI Influencer — Master Lessons'],
  ['troubleshooting.txt', 'AI Influencer — Troubleshooting'],
];
const STOP = new Set('the a an and or of to in is it for with my me how what why can do does please explain give tell about that this more elaborate simple simply you your hai ka ki ke ko se mein mujhe kya kaise'.split(' '));
const SYNONYMS = [
  ['face', 'identity', 'chehra', 'consistency', 'drift'],
  ['voice', 'audio', 'awaaz', 'awaz', 'robotic'],
  ['prompt', 'prompting', 'prompts'],
  ['realistic', 'realism', 'plastic', 'natural'],
  ['outfit', 'clothes', 'kapde'],
];

function terms(text) {
  return String(text).toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter(word => word.length > 2 && !STOP.has(word)) || [];
}

function chunks(text) {
  const sections = text.replace(/\r/g, '').split(/(?=^\s*(?:Lesson|LESSON)\s+\d+\s*[—:–-])/m);
  return sections.flatMap(section => {
    const heading = section.trim().split('\n')[0].slice(0, 160);
    const result = [];
    for (let start = 0; start < section.length; start += 1400) {
      const content = section.slice(start, start + 1800).trim();
      if (content.length > 60) result.push({ heading, content });
    }
    return result;
  });
}
const localDocuments = DOCUMENTS.flatMap(([file, title]) => {
  const text = fs.readFileSync(path.join(__dirname, '../knowledge/ai-influencer', file), 'utf8');
  return chunks(text).map(chunk => ({ ...chunk, title, courseSlug: 'ai-influencer', kind: 'course-material' }));
});

function hasLessonAccess(subscription, now = Date.now()) {
  if (!subscription) return false;
  if (['trial', '1rs trial'].includes(subscription.status)) return new Date(subscription.trialExpiresAt).getTime() > now;
  if (['active', 'subscribed'].includes(subscription.status)) return new Date(subscription.currentPeriodEnd).getTime() > now;
  return false;
}

function retrieveKnowledge({ courses, message, history = [], includeMaterials = false }) {
  const bySlug = new Map(courses.map(course => [course.slug, course]));
  const candidates = courses.flatMap(course => [
    { title: course.title, heading: 'Course overview', content: `${course.title}\n${course.description || ''}`, course, kind: 'course-overview' },
    ...(course.videos || []).map(video => ({ title: course.title, heading: video.title, content: `${video.title}\n${video.description || ''}${includeMaterials && video.examplePrompt ? `\nExample prompt: ${video.examplePrompt}` : ''}`, course, kind: 'lesson-overview' })),
  ]);
  if (includeMaterials) {
    candidates.push(...localDocuments.filter(doc => bySlug.has(doc.courseSlug)).map(doc => ({ ...doc, course: bySlug.get(doc.courseSlug) })));
  }

  // Short follow-ups need the preceding topic; an explicit new question takes priority.
  const currentTerms = terms(message);
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
    let score = 0;
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
    const key = `${doc.title}:${doc.heading}`;
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
    materialsAvailable: includeMaterials && bySlug.has('ai-influencer'),
  };
}

module.exports = { retrieveKnowledge, hasLessonAccess };
