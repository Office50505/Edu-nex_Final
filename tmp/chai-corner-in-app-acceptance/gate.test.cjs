const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createGate, sha, sanitized } = require('./gate.cjs');
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'native-acceptance-gate-'));
  for (const file of ['case.json', 'case.sha256']) fs.copyFileSync(path.join(__dirname, file), path.join(directory, file));
  const frozen = JSON.parse(fs.readFileSync(path.join(directory, 'case.json')));
  let now = Date.now();
  const options = { directory, configured: { key: 'offline-test-only', model: frozen.model, url: frozen.provider_url }, now: () => now };
  const gate = createGate(options);
  function approve() {
    fs.writeFileSync(gate.approvalPath, JSON.stringify({ approved: true, approval_id: 'offline-fixture',
      cases_sha256: gate.hash, turns_sha256: sha(JSON.stringify(frozen.turns)), model: frozen.model,
      user_id: frozen.user_id, course_id: frozen.course_id, conversation_id: frozen.conversation_id,
      max_calls: 4, issued_at: new Date(now).toISOString(), expires_at: new Date(now + 30 * 60000).toISOString() }));
  }
  function request(number, history = gate.expectedHistory(number)) {
    return { payload: { model: frozen.model, max_tokens: 900, messages: [{ role: 'system', content: 'Offline test context' }, ...sanitized(history), { role: 'user', content: frozen.turns[number - 1].query }] },
      context: { path: '/api/ai/chat', req: { method: 'POST', headers: {}, compatAuth: { userId: frozen.user_id },
        body: { activeCourseId: frozen.course_id, conversationId: frozen.conversation_id, message: frozen.turns[number - 1].query, history } },
      knowledge: { activeCourse: { id: frozen.course_id }, materialsAvailable: true, conversationHistory: sanitized(history) } } };
  }
  function firstResponse(answer) {
    gate.event('chat_response', { turn: 1, conversation_id: frozen.conversation_id, user_id: frozen.user_id,
      httpStatus: 200, request: { activeCourseId: frozen.course_id, message: frozen.turns[0].query },
      response: { provider: 'fal-openrouter', outcome: { liveModelAnswer: true }, answer } });
  }
  return { gate, options, frozen, approve, request, firstResponse, expire: () => { now += 31 * 60000; }, cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
}
for (const [name, mutate] of [
  ['no approval', () => {}],
  ['expired approval', f => { f.approve(); f.expire(); }],
  ['wrong native conversation', (f, r) => { f.approve(); r.context.req.body.conversationId = 'nai-other'; }],
  ['wrong account', (f, r) => { f.approve(); r.context.req.compatAuth.userId = 'other'; }],
  ['wrong active course', (f, r) => { f.approve(); r.context.req.body.activeCourseId = 'other'; }],
  ['changed exact question', (f, r) => { f.approve(); r.context.req.body.message += ' altered'; }],
  ['changed model', (f, r) => { f.approve(); r.payload.model = 'other'; }],
  ['unrecorded initial history', (f, r) => { f.approve(); r.context.req.body.history = []; }],
]) test(`native gate rejects ${name} before transport`, () => {
  const f = fixture(); try { const r = f.request(1); mutate(f, r); assert.throws(() => f.gate.consume(r.payload, r.context)); assert.equal(f.gate.count(), 0); } finally { f.cleanup(); }
});
test('native gate accepts original app body without terminal headers and preserves exact first answer', () => {
  const f = fixture(); try {
    f.approve(); const first = f.request(1); assert.equal(f.gate.consume(first.payload, first.context), 1);
    f.firstResponse('Offline response that was actually recorded for this fixture.');
    const second = f.request(2); assert.equal(second.context.req.body.history.length, 3);
    assert.equal(f.gate.consume(second.payload, second.context), 2);
    second.context.req.body.history[2].content = 'Invented first answer';
    assert.throws(() => f.gate.consume(second.payload, second.context), /previous_exchange/); assert.equal(f.gate.count(), 2);
  } finally { f.cleanup(); }
});
test('native gate keeps the four-attempt ledger through restarts and rejects a fifth attempt', () => {
  const f = fixture(); try {
    f.approve(); const r = f.request(1);
    for (let i = 1; i <= 4; i++) assert.equal(createGate(f.options).consume(r.payload, r.context), i);
    assert.equal(createGate(f.options).count(), 4);
    assert.throws(() => createGate(f.options).consume(r.payload, r.context), /budget_exhausted/);
    assert.equal(f.gate.count(), 4);
  } finally { f.cleanup(); }
});
test('native gate requires a genuine first response and rejects completed-turn replays', () => {
  const f = fixture(); try {
    f.approve(); const r = f.request(2, f.frozen.initial_history);
    assert.throws(() => f.gate.consume(r.payload, r.context), /first_live_turn_missing/);
    f.firstResponse('Recorded first answer'); const first = f.request(1);
    assert.throws(() => f.gate.consume(first.payload, first.context), /turn_already_completed/); assert.equal(f.gate.count(), 0);
  } finally { f.cleanup(); }
});
