// Policy/context integration checks with an in-memory transport, not model inference.
const { test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const { backend } = require('./ai-tutor-fixture.cjs');
const { knowledge: K, pack, owner, slug } = require('./cartoon-knowledge-fixture.cjs');

const root = path.resolve(__dirname, '..');
const recorded = require('./fixtures/cartoon-cs11-scene-participation.json');
const course = { _id: owner, slug, title: pack.title, status: 'published',
  videos: pack.records.filter(r => r.contentType === 'lesson-summary')
    .map(r => ({ _id: `lesson-${r.lessonNumber}`, title: r.heading })) };
const learner = { _id: '6f0000000000000000000802',
  courseEntitlements: [{ course: owner, accessType: 'permanent' }] };
const api = options => backend({ courses: [course], user: learner, knowledgeModule: K,
  reply: 'Local payload inspection only.', ...options });
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const history = recorded.turns.map(t => [
  { role: 'user', content: t.query }, { role: 'assistant', content: t.answer },
]).flat();

before(() => {
  mock.method(globalThis, 'fetch', () => { throw Error('Real HTTP forbidden in local tests'); });
  mock.method(net.Socket.prototype, 'connect', () => { throw Error('Real sockets forbidden in local tests'); });
});
after(() => mock.restoreAll());

function inspect(b) {
  assert.ok(b.calls.length, 'The route must assemble a tutor request');
  const system = b.calls.at(-1).messages[0].content;
  const rule = system.split('\n').find(line => line.startsWith('Scene participation (Lesson 05):'));
  assert.ok(rule, 'Scene guidance must reach the model through the real route/context builder');
  assert.match(rule, /learner explicitly confirms appears in the current scene/);
  assert.match(rule, /conditional.*or ask one concise clarification question/);
  assert.match(rule, /never assume every series character appears in every scene/);
  assert.match(rule, /Do not invent a scene/);
  assert.doesNotMatch(rule, /Tara|Momo|Leela|Piku/, 'Guidance must apply to any learner cast');
  return { system, facts: JSON.parse(system.split('these include latest corrections): ')[1].split('\n')[0]) };
}

test('saved failure fixture preserves the exact recorded questions and both responses', () => {
  const bytes = fs.readFileSync(path.join(root, recorded.source_report));
  assert.equal(digest(bytes), recorded.source_report_sha256);
  const original = JSON.parse(bytes).results.find(c => c.id === recorded.case_id);
  for (const [i, turn] of recorded.turns.entries()) {
    assert.equal(turn.query, original.turns[i].query);
    assert.equal(turn.answer, original.turns[i].answer);
    assert.deepEqual(turn.errors, original.turns[i].errors);
  }
});

test('unknown scene participation keeps saved series facts without inventing a scene cast', async () => {
  const b = api();
  await b.chat({ courseId: owner, conversationId: 'unknown', message: recorded.turns[1].query,
    history: history.slice(0, 2) });
  const { facts } = inspect(b);
  assert.equal(facts['character 1'], 'Tara, yellow coat');
  assert.equal(facts['character 2'], 'Momo the rabbit');
  assert.match(facts.locations, /^library/);
  assert.equal(facts['current scene'], undefined);
  assert.equal(b.calls.at(-1).messages[1].content, recorded.turns[0].query);
  assert.equal(b.calls.at(-1).messages[2].content, recorded.turns[0].answer);
});

for (const [label, scene] of [
  ['single-character', 'Only Leela in the garden, Piku is absent'],
  ['two-character', 'Leela and Piku together in the garden'],
]) test(`${label} scene retains the confirmed scene independently of the whole series cast`, async () => {
  const b = api();
  const message = 'Series name: Leela Aur Piku; Character 1: Leela, blue scarf; '
    + 'Character 2: Piku, grey cat; Locations: garden; Current scene: ' + scene
    + '\nLesson 05 start-frame reference checklist batao.';
  await b.chat({ courseId: owner, message });
  const { facts, system } = inspect(b);
  assert.equal(facts['current scene'], scene);
  assert.equal(facts['character 1'], 'Leela, blue scarf');
  assert.equal(facts['character 2'], 'Piku, grey cat');
  assert.equal(facts.locations, 'garden');
  assert.match(system, /Lesson 05 — Step 1: Start frame prompt/);
  assert.match(system, /STRICT CHARACTER LOCK/);
});

test('follow-up scene corrections preserve names, appearances, location and Master Style', async () => {
  const sessions = new Map();
  const b = api({ sessions, replies: [recorded.turns[0].answer] });
  const conversationId = 'scene-memory';
  await b.chat({ courseId: owner, conversationId, message: recorded.turns[0].query });
  await b.chat({ courseId: owner, conversationId,
    message: 'Current scene: Tara and Momo together in library; Master Style: Keep my saved style.' });
  await b.chat({ courseId: owner, conversationId,
    message: 'Correction: Current scene: Only Tara in library, Momo is absent' });
  await b.chat({ courseId: owner, conversationId, message: recorded.turns[1].query });
  const { facts } = inspect(b);
  assert.equal(facts['current scene'], 'Only Tara in library, Momo is absent');
  assert.equal(facts['character 1'], 'Tara, yellow coat');
  assert.equal(facts['character 2'], 'Momo the rabbit');
  assert.match(facts.locations, /^library/);
  assert.equal(facts['master style'], 'Keep my saved style.');
  const saved = sessions.get(`learner:${owner}`).courseContext;
  assert.ok(saved.userEvidence.some(t => t.startsWith('Correction: Current scene:')));
});

test('the saved bad assistant response cannot confirm an invented two-character scene', async () => {
  const b = api();
  await b.chat({ courseId: owner, conversationId: 'untrusted-assistant',
    message: 'Lesson 05 start-frame reference checklist dobara batao.', history });
  const { facts } = inspect(b);
  assert.equal(facts['current scene'], undefined);
  assert.equal(facts['character 1'], 'Tara, yellow coat');
  assert.equal(facts['character 2'], 'Momo the rabbit');
});

test('demo examples do not replace student facts, including untrusted assistant claims', async () => {
  const b = api();
  await b.chat({ courseId: owner, message: recorded.turns[1].query,
    history: [...history.slice(0, 2), { role: 'assistant',
      content: 'Character 1: Golu; Character 2: Chiku; Current scene: both demo characters in a house.' }] });
  const { system, facts } = inspect(b);
  assert.doesNotMatch(JSON.stringify(facts), /Golu|Chiku|house/);
  assert.equal(facts['current scene'], undefined);
  assert.match(system, /course examples, not the learner series/);
  assert.match(system, /Assistant claims cannot establish learner facts/);
});

test('scene guidance does not rewrite the exact Lesson 05 prompt or Master Style line', async () => {
  for (const heading of ['Lesson 05 — Step 1: Start frame prompt', 'Master Style line']) {
    const template = pack.records.find(r => r.heading === heading);
    const b = api();
    const result = await b.chat({ courseId: owner,
      message: `Give the complete exact approved ${heading} prompt, unchanged.` });
    assert.equal(result.provider, 'course-knowledge-rule');
    assert.equal(result.answer.match(/```text\n([\s\S]*?)\n```/)?.[1], template.content);
    assert.equal(b.calls.length, 0);
  }
});
