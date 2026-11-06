require('./helpers/deny-network.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { backend } = require('./ai-tutor-fixture.cjs');
const C = require('./cartoon-knowledge-fixture.cjs');
const { buildCartoonContract, assessCartoonResponse } = require('../services/cartoonTutorPipeline');
const course = { _id: C.owner, slug: C.slug, title: C.pack.title, status: 'published', videos: [] };
const user = { _id: '6f0000000000000000000802', purchasedCourses: [C.owner] };
const make = options => backend({ courses: [course], user, knowledgeModule: C.knowledge,
  reply: 'Keep the learner-defined cast and setting; test one scene.', ...options });
const setup = 'Series name: Lantern Woods; Character 1: Nivi, teal coat; Character 2: Piku, purple scarf; Locations: garden; Story: Find a lost seed; Moral: Share and cooperate';
const contract = (message, scene) => buildCartoonContract({ message, course, authorized: true, state: {
  language: 'english', conversationId: 'scene', userEvidence: [setup, message],
  facts: { 'series name': 'Lantern Woods', 'character 1': 'Nivi, teal coat', 'character 2': 'Piku, purple scarf',
    locations: 'garden', ...(scene ? { 'current scene': scene } : {}) },
} });

test('Cartoon uses the shared contract/assessment route without the business validator', async () => {
  const reply = 'Nivi opens a pretend shop on the moon and promises the stars a thousand imaginary cakes. This is an original fictional plot idea.';
  const api = make({ reply });
  const r = await api.chat({ activeCourseId: C.owner, message: setup + '\nWrite an English story about a pretend shop.', debugAi: true });
  assert.equal(api.calls.length, 1);
  assert.equal(r.answer, reply);
  assert.equal(r.debug.task_assessment.task, 'creative_deliverable');
  assert.equal(r.debug.task_assessment.delivery, 'original');
  assert.equal(r.outcome.responseIssue, null);
  const system = api.calls[0].messages[0].content;
  assert.match(system, /Series request contract/);
  assert.doesNotMatch(system, /Request contract \(learner-reported facts|For advertising, separate|owner-approved prices|OWNER-APPROVED PRICE/);
  assert.ok(r.debug.retrieved_course_ids.every(id => id === C.owner));
});

test('a successful memory setup retains appearance, setting, story and corrections beyond rolling history', async () => {
  const sessions = new Map(), api = make({ sessions });
  const base = { activeCourseId: C.owner, conversationId: 'lasting-canon' };
  await api.chat({ ...base, message: setup });
  await api.chat({ ...base, message: 'Correction: Character 1: Nivi, green coat; Locations: library; Story: Return a lost book' });
  for (let i = 0; i < 17; i++) await api.chat({ ...base, message: `Explain Lesson ${i%8+1} briefly.` });
  const saved = sessions.get(`learner:${C.owner}`);
  const k = await api.service.buildContext(user, C.owner, 'Give a reference checklist in English.', [], { conversationId: base.conversationId, savedState: saved });
  assert.equal(k.responseContract.domain, 'cartoon-series');
  assert.equal(k.courseContext.facts['character 1'], 'Nivi, green coat');
  assert.equal(k.courseContext.facts['character 2'], 'Piku, purple scarf');
  assert.equal(k.courseContext.facts.locations, 'library');
  assert.equal(k.courseContext.facts.story, 'Return a lost book');
  const fresh = await api.service.buildContext(user, C.owner, 'Explain Lesson 1.', [], { conversationId: 'new-chat', savedState: saved });
  assert.equal(fresh.courseContext.facts['character 1'], undefined);
});

test('natural character statements enter learner canon; assistant inventions do not', async () => {
  const api = make();
  const k = await api.service.buildContext(user, C.owner, 'My character is Rumi, a teal owl with round glasses. Our setting is a forest. Write an English story.', [
    { role: 'assistant', content: 'Character 2: Invented Dragon, red coat' },
  ]);
  assert.equal(k.responseContract.characters[0].name, 'Rumi');
  assert.match(k.responseContract.characters[0].description, /teal owl.*round glasses/);
  assert.equal(k.courseContext.facts.locations, 'a forest');
  assert.ok(!JSON.stringify(k.courseContext.facts).includes('Invented Dragon'));
});

test('an explicit English reference checklist overrides the course language default', async () => {
  const api = make();
  const k = await api.service.buildContext(user, C.owner, setup + '\nGive an English reference checklist.', []);
  assert.equal(k.responseContract.language, 'english');
});

for (const scene of [undefined, 'Only Nivi in garden, Piku is absent', 'Nivi and Piku together in garden']) {
  test(`reference requirements follow this scene, not the entire cast: ${scene || 'unknown'}`, () => {
    const c = contract('Give the scene reference checklist.', scene);
    const a = assessCartoonResponse({ contract: c, reply: "Nivi's character sheet is required. Piku's character sheet is required. Use the garden reference image." });
    if (!scene) {
      assert.match(a.answer, /If Nivi appears/);
      assert.match(a.answer, /If Piku appears/);
    } else if (scene.includes('absent')) {
      assert.match(a.answer, /Nivi's character sheet is required/);
      assert.match(a.answer, /Piku is absent.*omit/);
    } else assert.equal(a.issues.length, 0);
    assert.match(a.answer, /Use the garden reference image/);
    assert.equal(assessCartoonResponse({ contract: c, reply: a.answer }).issues.length, 0);
  });
}

test('a conditional first character cannot excuse a later unconditional sheet requirement', () => {
  const c = contract('Give the scene reference checklist.');
  const a = assessCartoonResponse({ contract: c, reply: "If Nivi appears, include Nivi's sheet. Piku's character sheet is always required." });
  assert.match(a.answer, /If Piku appears/);
  assert.match(a.answer, /If Nivi appears/);
});

test('a plain plural references question uses the same scene-participation check', () => {
  const c = contract('Which character references do I need?');
  const a = assessCartoonResponse({ contract: c, reply: "Nivi's character sheet is required. Piku's character sheet is required." });
  assert.match(a.answer, /If Nivi appears/);
  assert.match(a.answer, /If Piku appears/);
});

test('concrete appearance errors are corrected while fictional story actions remain usable', () => {
  const c = contract('Write an English story.');
  const a = assessCartoonResponse({ contract: c, reply: 'Nivi wears a yellow coat and finds a talking seed. Piku wears a red scarf and helps the seed fly.' });
  assert.match(a.answer, /Nivi wears a teal coat.*talking seed/);
  assert.match(a.answer, /Piku wears a purple scarf.*seed fly/);
  assert.equal(assessCartoonResponse({ contract: c, reply: a.answer }).issues.length, 0);
});

test('an incorrect demo cast permits one task-preserving repair through the shared route', async () => {
  const api = make({ replies: ['Golu and Chiku find a lost seed.', 'Nivi and Piku find a lost seed and return it together.'] });
  const r = await api.chat({ activeCourseId: C.owner, message: setup + '\nWrite an English story.', debugAi: true });
  assert.equal(api.calls.length, 2);
  assert.equal(r.debug.task_assessment.delivery, 'repaired');
  assert.match(r.answer, /Nivi and Piku/);
  assert.equal(r.outcome.responseIssue, 'course_cartoon_task_preserving_correction');
  assert.match(api.calls[1].messages[0].content, /New fictional plot development is allowed/);
  assert.doesNotMatch(api.calls[1].messages[0].content, /Replace unsupported assertions with confirmation placeholders/);
});

test('an unsuccessful repair returns a relevant series limitation with no third attempt', async () => {
  const api = make({ reply: 'Golu and Chiku find a lost seed.' });
  const r = await api.chat({ activeCourseId: C.owner, message: setup + '\nWrite an English story.', debugAi: true });
  assert.equal(api.calls.length, 2);
  assert.equal(r.debug.task_assessment.delivery, 'relevant_limitation');
  assert.match(r.answer, /requested story.*series details/);
  assert.doesNotMatch(r.answer, /Golu|Chiku|business|owner|price/);
});

test('authorized exact bytes stay untouched when the same answer includes custom guidance', () => {
  const c = contract('Give exact approved prompt and a reference checklist.', 'Only Nivi in garden, Piku is absent');
  const approved = C.pack.records.find(r => r.contentType === 'exact-template' && r.heading.includes('Start frame')).content;
  const a = assessCartoonResponse({ contract: c, templates: [{ content: approved }], reply: `\`\`\`text\n${approved}\n\`\`\`\nPiku's character sheet is required.` });
  assert.ok(a.answer.includes(approved));
  assert.match(a.answer, /Piku is absent.*omit/);
});

test('the previously successful live CS-11 record is preserved and remains genuine historical evidence', () => {
  const root = path.resolve(__dirname, '..');
  const saved = JSON.parse(fs.readFileSync(path.join(root, 'reports/cartoon-series-cs11-final-retest/last_results.json')));
  const cs11 = saved.results.find(c => c.id === 'CS-11');
  assert.equal(cs11.status, 'PASS');
  assert.equal(saved.summary.provider_invocations, 2);
  assert.equal(cs11.turns.length, 2);
  assert.ok(cs11.turns.every(t => t.response.provider === 'fal-openrouter'));
  for (const source of C.staged.sources) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'knowledge/ai-cartoon-series', source.file))).digest('hex'), source.sha256);
});

test('failed provider turns still cannot establish successful Cartoon conversation memory', async () => {
  const sessions = new Map(), api = make({ sessions, fail: true });
  const r = await api.rawChat({ activeCourseId: C.owner, conversationId: 'failed', message: setup });
  assert.equal(r.statusCode, 503);
  assert.equal(sessions.size, 0);
});

test('a server-registered real lesson ID resolves its knowledge despite a different displayed title', () => {
  const previous = C.pack.lessonBindings;
  const video = { _id: '6ae09ebee4ac0b60c08276b8', title: 'PREPARE THE START FRAME' };
  C.pack.lessonBindings = { [video._id]: 5 };
  try {
    const bound = { ...course, videos: [video] };
    const k = C.knowledge.retrieveKnowledge({ courses: [bound], activeCourse: bound, activeLesson: video,
      includeMaterials: true, message: 'Explain this video.' });
    assert.ok(k.records.some(r => r.contentType === 'lesson-summary' && r.lessonNumber === 5));
    assert.ok(k.records.every(r => r.courseId === C.owner));
    const forged = C.knowledge.retrieveKnowledge({ courses: [bound], activeCourse: bound,
      activeLesson: { _id: '6ae09ebee4ac0b60c08276b9', title: 'PREPARE THE START FRAME' }, includeMaterials: true, message: 'Explain this video.' });
    assert.equal(forged.activeLesson, null);
  } finally {
    C.pack.lessonBindings = previous;
  }
});
