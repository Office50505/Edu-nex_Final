const test = require('node:test');
const assert = require('node:assert/strict');
const { retrieveKnowledge, hasLessonAccess } = require('../services/tutorKnowledge');
const course = { _id: '6a9e67c46bcb631b8118d341', slug: 'ai-influencer', title: 'AI Influencer Course', description: 'Create consistent AI characters and videos.', videos: [{ title: 'Prompting', description: 'Write clear prompts.', examplePrompt: 'PAID_EXAMPLE_SENTINEL' }] };
const retrieve = (message, options = {}) => retrieveKnowledge({ courses: [course], message, includeMaterials: true, ...options });

for (const [question, expected] of [
  ['My character face changes between clips. How do I keep the same identity?', /same face|locked|reference/i],
  ['Mera chehra har video mein badal jaata hai', /face|reference|still/i],
  ['My voice sounds robotic. How do I fix the audio?', /voice|ElevenLabs|recording/i],
  ['How can I make skin look realistic instead of plastic?', /pores|skin|realism/i],
]) test(`retrieves supporting course material: ${question}`, () => {
  const result = retrieve(question);
  assert.ok(result.sources.some(source => source.kind === 'course-material'));
  assert.match(result.excerpts, expected);
  assert.ok(result.sources.length <= 6);
  assert.ok(result.sources.every(source => source.url.startsWith('/course-details.html?id=')));
});

test('a short follow-up retrieves the preceding topic', () => {
  const result = retrieve('elaborate', { history: [{ role: 'user', content: 'My character face changes between clips' }, { role: 'assistant', content: 'Use one locked reference still for identity consistency.' }] });
  assert.match(result.excerpts, /face|reference/i);
  assert.ok(result.sources.length > 0);
});

test('paid documents and example prompts are not retrieved without lesson access', () => {
  const result = retrieve('Prompting face locked still', { includeMaterials: false });
  assert.ok(result.sources.every(source => source.kind !== 'course-material'));
  assert.doesNotMatch(result.excerpts, /PAID_EXAMPLE_SENTINEL/);
  assert.equal(result.materialsAvailable, false);
});

test('documents cannot be retrieved under another course or unpublished course', () => {
  assert.equal(retrieve('face', { courses: [] }).sources.length, 0);
  const result = retrieve('face', { courses: [{ ...course, slug: 'python' }] });
  assert.ok(result.sources.every(source => source.kind !== 'course-material'));
});

test('active and trial access expire and cancelled access is denied', () => {
  const now = Date.now();
  assert.equal(hasLessonAccess(null, now), false);
  assert.equal(hasLessonAccess({ status: 'active', currentPeriodEnd: new Date(now + 1000) }, now), true);
  assert.equal(hasLessonAccess({ status: 'trial', trialExpiresAt: new Date(now + 1000) }, now), true);
  assert.equal(hasLessonAccess({ status: 'active', currentPeriodEnd: new Date(now - 1000) }, now), false);
  assert.equal(hasLessonAccess({ status: 'cancelled', currentPeriodEnd: new Date(now + 1000) }, now), false);
});
