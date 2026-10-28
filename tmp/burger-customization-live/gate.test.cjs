const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createGate, sha } = require('./gate.cjs');
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'native-relevance-single-'));
  for (const file of ['case.json', 'case.sha256']) fs.copyFileSync(path.join(__dirname, file), path.join(directory, file));
  const frozen = JSON.parse(fs.readFileSync(path.join(directory, 'case.json')));
  let now = Date.now();
  const options = { directory, configured: { key: 'offline-fixture', model: frozen.model, url: frozen.provider_url }, now: () => now };
  const gate = createGate(options);
  const approval = { approved: true, approval_id: 'offline', model: frozen.model, cases_sha256: gate.hash,
    turns_sha256: sha(JSON.stringify(frozen.turns)), user_id: frozen.user_id, course_id: frozen.course_id,
    conversation_id: frozen.conversation_id, max_calls: 2, issued_at: new Date(now).toISOString(), expires_at: new Date(now + 30 * 60000).toISOString() };
  const req = { method: 'POST', headers: {}, compatAuth: { userId: frozen.user_id }, body: {
    message: frozen.turns[0].query, activeCourseId: frozen.course_id, conversationId: frozen.conversation_id, history: frozen.initial_history } };
  const context = { path: '/api/ai/chat', req, knowledge: { activeCourse: { id: frozen.course_id }, materialsAvailable: true, conversationHistory: frozen.initial_history } };
  const payload = { model: frozen.model, max_tokens: 900, messages: [{ role: 'system', content: 'Offline fixture' }, ...frozen.initial_history, { role: 'user', content: frozen.turns[0].query }] };
  return { gate, options, frozen, approval, context, payload,
    approve: () => fs.writeFileSync(gate.approvalPath, JSON.stringify(approval)),
    expire: () => { now += 31 * 60000; }, cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
}
for (const [name, change] of [
  ['absent approval', () => {}],
  ['expired approval', f => { f.approve(); f.expire(); }],
  ['changed question', f => { f.approve(); f.context.req.body.message += ' changed'; }],
  ['different conversation', f => { f.approve(); f.context.req.body.conversationId = 'nai-other'; }],
  ['different course', f => { f.approve(); f.context.req.body.activeCourseId = 'other'; }],
  ['different account', f => { f.approve(); f.context.req.compatAuth.userId = 'other'; }],
  ['different model', f => { f.approve(); f.payload.model = 'other'; }],
  ['changed initial history', f => { f.approve(); f.context.req.body.history = []; }],
  ['attempt limit raised to four', f => { f.approval.max_calls = 4; f.approve(); }],
]) test(`single native gate rejects ${name}`, () => {
  const f = fixture(); try { change(f); assert.throws(() => f.gate.consume(f.payload, f.context)); assert.equal(f.gate.count(), 0); } finally { f.cleanup(); }
});
test('single native gate durably permits only two total attempts including a retry', () => {
  const f = fixture(); try {
    f.approve(); assert.equal(f.gate.consume(f.payload, f.context), 1);
    assert.equal(createGate(f.options).consume(f.payload, f.context), 2);
    assert.throws(() => createGate(f.options).consume(f.payload, f.context), /budget_exhausted/);
    assert.equal(createGate(f.options).count(), 2);
  } finally { f.cleanup(); }
});
test('completed native single question cannot be replayed', () => {
  const f = fixture(); try {
    f.approve(); f.gate.event('chat_response', { turn: 1, conversation_id: f.frozen.conversation_id, user_id: f.frozen.user_id,
      request: { message: f.frozen.turns[0].query, activeCourseId: f.frozen.course_id }, httpStatus: 200,
      response: { provider: 'fal-openrouter', outcome: { liveModelAnswer: true }, answer: 'Offline answer' } });
    assert.throws(() => f.gate.consume(f.payload, f.context), /turn_already_completed/); assert.equal(f.gate.count(), 0);
  } finally { f.cleanup(); }
});
