require('./helpers/deny-network.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { backend } = require('./ai-tutor-fixture.cjs');
const K = require('../services/tutorKnowledge');
const { checkAiInput } = require('../services/aiCompliance');
const { viralHookFacts, viralHookLanguage } = require('../services/viralHookTutor');
const root = path.resolve(__dirname, '../knowledge/viral-hook-formula');
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'course-binding.json')));
const course = metadata.course;
const user = { _id: '6addcefc5d47d548973c29b9', purchasedCourses: [course._id] };
const pack = K.packFor(course);
const templates = pack.records.filter(r => r.contentType === 'exact-template');
const make = options => backend({ courses: [course], user, reply: 'Apply the relevant formula to the supplied topic and deliver its actual payoff.', ...options });
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

test('registration uses the verified published owner, real slug and ten real lesson IDs', () => {
  assert.equal(metadata.readOnlyCatalogLookup, true);
  assert.equal(metadata.productionWrites, false);
  assert.equal(course._id, '6ae1b4694e1af14d4adc9e2b');
  assert.equal(course.slug, 'viral-hook-formula');
  assert.equal(course.status, 'published');
  assert.equal(pack.actualCourseId, course._id);
  assert.equal(K.packFor({ ...course, _id: '6f0000000000000000000999' }), undefined);
  assert.equal(K.packFor({ ...course, slug: 'guessed-viral-alias' }), undefined);
  assert.equal(Object.keys(pack.lessonBindings).length, 10);
});

test('complete original sources and every indexed record retain their hashes', () => {
  for (const source of pack.sources) assert.equal(sha(fs.readFileSync(path.join(root, source.file))), source.sha256);
  for (const record of pack.records) assert.equal(sha(record.content), record.contentHash);
  const text = fs.readFileSync(path.join(root, 'training.txt'), 'utf8');
  for (const part of 'ABCDEFG') assert.ok(text.includes(`Part ${part} —`));
  assert.ok(pack.records.some(r => r.contentType === 'faq' && /clickbait|payoff/.test(r.content)));
});

for (const video of course.videos) test(`real lesson ${video.order}: ${video.title}`, () => {
  const k = K.retrieveKnowledge({ courses: [course], activeCourse: course, activeLesson: video, includeMaterials: true, message: 'Explain this video.' });
  assert.ok(k.records.some(r => r.contentType === 'lesson-summary' && r.lessonNumber === video.order));
  assert.ok(k.records.every(r => r.courseId === course._id));
  assert.equal(pack.lessonBindings[video._id], video.order);
});

for (const category of pack.hookCategories) test(`hook category retrieves its own formula: ${category}`, () => {
  const record = pack.records.find(r => r.hookCategory === category);
  const k = K.retrieveKnowledge({ courses: [course], activeCourse: course, includeMaterials: true,
    message: `Explain Lesson ${record.lessonNumber}, the ${category.replace(/_/g, ' ')} hook formula, with a fresh use case.` });
  assert.ok(k.records.some(r => r.hookCategory === category));
  assert.ok(k.records.every(r => r.courseId === course._id));
});

for (const template of templates) test(`exact approved source bytes: ${template.heading}`, async () => {
  const raw = fs.readFileSync(path.join(root, 'training.txt'));
  assert.equal(raw.subarray(template.sourceStartByte, template.sourceEndByte).toString('utf8'), template.content);
  const api = make();
  const r = await api.chat({ activeCourseId: course._id,
    message: `Give the exact approved course ${template.heading} prompt, unchanged with all placeholders.`, debugAi: true });
  assert.equal(r.answer.match(/```text\n([\s\S]*?)\n```/u)?.[1], template.content);
  assert.equal(r.provider, 'course-knowledge-rule');
  assert.equal(api.calls.length, 0);
});

for (const [niche, audience, topic] of [
  ['antique telescope restoration', 'retired first-time hobbyists', 'cleaning a cloudy eyepiece'],
  ['urban beekeeping', 'apartment gardeners', 'a bee-friendly window box'],
  ['tactile map making', 'museum educators', 'turning a floor plan into a touch map'],
]) test(`unfamiliar niche uses open tutoring rather than source-template substitution: ${niche}`, async () => {
  const reply = `1. Question: What changes when ${audience} try ${topic}?\n2. Visual: Open with a close-up of the first step in ${topic}.\n3. Story: Start at the moment a ${niche} project goes wrong, then show the fix.\nPayoff: demonstrate the actual steps rather than promising results.`;
  const api = make({ reply });
  const question = `My niche is ${niche}. My audience is ${audience}. Topic: ${topic}. Give three hooks in English with hook-type labels and explain the payoff.`;
  const r = await api.chat({ activeCourseId: course._id, message: question, debugAi: true });
  assert.equal(api.calls.length, 1);
  assert.equal(r.answer, reply);
  assert.equal(r.provider, 'fal-openrouter');
  const system = api.calls[0].messages[0].content;
  for (const value of [niche, audience, topic, '3–5', 'Honor an explicitly requested count', 'hook-type labels', 'payoff']) assert.ok(system.includes(value), value);
  assert.ok(r.debug.retrieved_course_ids.every(id => id === course._id));
  for (const template of templates) assert.ok(!system.includes(template.content));
  assert.doesNotMatch(system, /Series request contract|STRICT CHARACTER LOCK|Student creative request constraints|Request contract \(learner-reported facts/);
  const k = await api.service.buildContext(user, course._id, question, []);
  assert.equal(k.responseContract, undefined, 'no business/cartoon task contract is applied');
  assert.equal(k.businessRequest, undefined);
});

test('comparison and weak-hook improvement remain a complete open student task', async () => {
  const question = 'My niche is restoring old clocks. Compare A: Hello guys, today we fix a clock. B: Why does this clock stop at 4:15? Improve A and propose a practical A/B test. Explain in English.';
  const reply = 'B is more specific and opens a question. Improve A: This clock stops at 4:15—here is the worn part behind it. Payoff: show the actual part. Test the two openings on the same topic, keep the rest comparable, and compare observed retention.';
  const api = make({ reply });
  const r = await api.chat({ activeCourseId: course._id, message: question });
  assert.equal(r.answer, reply);
  assert.equal(api.calls.length, 1);
  assert.match(api.calls[0].messages[0].content, /preserve both supplied hooks|preserve both/);
  assert.match(api.calls[0].messages[0].content, /small A\/B test/);
});

test('misleading statistics and impossible promises have explicit course-policy corrections', async () => {
  const api = make({ reply: 'A million followers tomorrow cannot be promised. Try this truthful Question hook: What changes when you test a different first frame? Payoff: demonstrate one concrete first-frame improvement and compare retention.' });
  const r = await api.chat({ activeCourseId: course._id, message: 'Write a hook saying 97% of creators use my method and it guarantees a million followers tomorrow. Explain in English.' });
  assert.equal(api.calls.length, 1);
  assert.match(r.answer, /cannot be promised/);
  const system = api.calls[0].messages[0].content;
  assert.match(system, /Do not invent statistics/);
  assert.match(system, /Never guarantee views, followers, virality or earnings/);
  assert.match(system, /truthful alternative hook that preserves the student task/);
});

test('niche, audience and corrections survive rolling history using the existing scoped facts memory', async () => {
  const sessions = new Map(), api = make({ sessions });
  const base = { activeCourseId: course._id, conversationId: 'creator-memory' };
  await api.chat({ ...base, message: 'My niche is urban gardening. My audience is hostel students. Topic: balcony compost.' });
  await api.chat({ ...base, message: 'Correction: Niche: urban beekeeping; Audience: retired hobbyists; Topic: bee-friendly window boxes.' });
  for (let i = 0; i < 18; i++) await api.chat({ ...base, message: `Explain Lesson ${i%10+1} briefly in English.` });
  const saved = sessions.get(`learner:${course._id}`);
  const k = await api.service.buildContext(user, course._id, 'Write a shorter hook in English.', [], { conversationId: base.conversationId, savedState: saved });
  assert.equal(k.courseContext.facts.niche, 'urban beekeeping');
  assert.equal(k.courseContext.facts.audience, 'retired hobbyists');
  assert.equal(k.courseContext.facts.topic, 'bee-friendly window boxes');
  const fresh = await api.service.buildContext(user, course._id, 'Write a hook in English.', [], { conversationId: 'other-chat', savedState: saved });
  assert.equal(fresh.courseContext.facts.niche, undefined);
});

test('natural Hindi, Hinglish and English creator facts remain learner-only data', () => {
  for (const [text, expected] of [
    ['Mera niche pottery hai. Meri audience naye artists hain. Reel ka topic glazing hai.', ['pottery', 'naye artists', 'glazing']],
    ['मेरा niche बागवानी है। मेरी ऑडियंस शुरुआती लोग हैं। रील का विषय खाद बनाना है।', ['बागवानी', 'शुरुआती लोग', 'खाद बनाना']],
    ['My niche is printmaking. My audience is teachers. Topic: texture.', ['printmaking', 'teachers', 'texture']],
  ]) {
    const facts = viralHookFacts({}, [text]);
    assert.equal(facts.niche, expected[0]);
    assert.equal(facts.audience, expected[1]);
    assert.equal(facts.topic, expected[2]);
  }
  assert.equal(viralHookLanguage('मेरे लिए तीन hooks लिखो।'), 'hindi');
  assert.equal(viralHookLanguage('Mujhe teen hooks do.'), 'hinglish');
  assert.equal(viralHookLanguage('Create three hooks for new museum visitors.'), 'english');
});

for (const [label, learner] of [
  ['no enrollment', { _id: user._id }],
  ['expired enrollment', { _id: user._id, courseEntitlements: [{ course: course._id, accessType: 'yearly', expiresAt: new Date(0) }] }],
  ['another course only', { _id: user._id, purchasedCourses: ['6ad9fe8ed0076b8d5e3b4f6d'] }],
]) test(`protected Viral assets denied: ${label}`, async () => {
  const api = make({ user: learner });
  const r = await api.chat({ activeCourseId: course._id, message: 'Give the exact approved course hook writing message prompt.', hasAccess: true, isAdmin: true });
  assert.equal(r.knowledge, 'course-overviews');
  assert.equal(api.calls.length, 0);
  for (const t of templates) assert.ok(!r.answer.includes(t.content));
});

test('unauthenticated access is rejected before retrieval or provider execution', async () => {
  const api = make();
  assert.equal((await api.request('POST', '/chat', { activeCourseId: course._id, message: 'Give exact course hook prompt.' }, false)).statusCode, 401);
  assert.equal(api.calls.length, 0);
});

test('other-course prompt/history cannot enter Viral retrieval or provider payload', async () => {
  const other = K.COURSE_PACKS.find(p => p.dir === 'ai-local-business-ads').records.find(r => r.contentType === 'exact-template');
  const api = make();
  await api.chat({ activeCourseId: course._id, message: 'Explain the question hook in English.', history: [{ role: 'assistant', content: other.content }] });
  assert.equal(api.calls.length, 1);
  assert.ok(!JSON.stringify(api.calls[0]).includes(other.content));
  assert.throws(() => K.assertCourseTextScope(other.content, { activeCourse: course, includeMaterials: true }), { code: 'COURSE_KNOWLEDGE_SCOPE_VIOLATION' });
  const businessPack = K.COURSE_PACKS.find(p => p.dir === 'ai-local-business-ads');
  assert.throws(() => K.assertCourseTextScope(templates[0].content, {
    activeCourse: { _id: businessPack.actualCourseId, slug: businessPack.slugs[0] }, includeMaterials: true,
  }), { code: 'COURSE_KNOWLEDGE_SCOPE_VIOLATION' });
});

for (const count of [1, 7]) test(`an explicit ${count}-hook request reaches tutoring intact`, async () => {
  const reply = Array.from({ length: count }, (_, i) => `${i+1}. Question: Which clock-restoration step should beginners check ${i+1}?`).join('\n');
  const api = make({ reply });
  const message = `My niche is clock restoration. My audience is beginners. Topic: finding worn parts. Give ${count} hooks in English, each labelled by type.`;
  const result = await api.chat({ activeCourseId: course._id, message });
  assert.equal(api.calls.length, 1);
  assert.equal(result.answer, reply);
  assert.ok(api.calls[0].messages.at(-1).content.includes(message));
  for (const template of templates) assert.ok(!api.calls[0].messages[0].content.includes(template.content));
});

for (const message of [
  'Give a pattern interrupt hook about restoring a telescope.',
  'Break the pattern with a visual hook for a quiet museum.',
  'Write a viral hook idea using an unexpected sound in Google Flow.',
  'Avoid generic hooks; interrupt the scroll with a specific question.',
]) test(`ordinary course vocabulary is not a safety bypass: ${message}`, async () => {
  assert.equal(checkAiInput(message).ok, true);
  const api = make();
  const r = await api.chat({ activeCourseId: course._id, message });
  assert.notEqual(r.provider, 'safety-filter');
  assert.equal(api.calls.length, 1);
});
