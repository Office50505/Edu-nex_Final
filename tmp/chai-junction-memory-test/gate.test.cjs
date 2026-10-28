const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createGate, sha, sanitized } = require('./gate.cjs');
const { evaluate } = require('./evaluate.cjs');
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lba-memory-gate-offline-'));
  for (const file of ['case.json', 'case.sha256']) fs.copyFileSync(path.join(__dirname, file), path.join(directory, file));
  const frozen = JSON.parse(fs.readFileSync(path.join(directory, 'case.json')));
  let time = Date.now();
  const options = { directory, configured: { key: 'offline-fixture-key', model: frozen.model, url: frozen.provider_url }, now: () => time };
  const gate = createGate(options);
  const approved = { approved: true, model: frozen.model, cases_sha256: gate.hash,
    turns_sha256: sha(JSON.stringify(frozen.turns)), user_id: frozen.user_id, course_id: frozen.course_id,
    conversation_id: frozen.conversation_id, max_calls: 4, issued_at: new Date(time).toISOString(), expires_at: new Date(time + 30 * 60_000).toISOString() };
  const approve = () => fs.writeFileSync(gate.approvalPath, JSON.stringify(approved));
  function firstResponse(answer = 'Offline fixture answer, never an actual provider result.') {
    gate.event('chat_response', { turn: 1, conversation_id: frozen.conversation_id, user_id: frozen.user_id,
      httpStatus: 200, request: { activeCourseId: frozen.course_id, message: frozen.turns[0].query },
      response: { answer, provider: 'fal-openrouter', outcome: { liveModelAnswer: true } } });
    return answer;
  }
  function request(turn, history = []) {
    return { context: { path: '/api/ai/chat', req: { method: 'POST',
      headers: { 'x-memory-live-case': gate.hash, 'x-memory-turn': String(turn) },
      body: { message: frozen.turns[turn - 1].query, activeCourseId: frozen.course_id, conversationId: frozen.conversation_id, history },
      compatAuth: { userId: frozen.user_id } }, knowledge: { activeCourse: { id: frozen.course_id }, materialsAvailable: true, conversationHistory: sanitized(history) } },
      payload: { model: frozen.model, max_tokens: 900, messages: [{ role: 'system', content: 'Offline fixture' }, ...sanitized(history), { role: 'user', content: frozen.turns[turn - 1].query }] } };
  }
  return { gate, frozen, options, approved, approve, firstResponse, request,
    expire: () => { time += 31 * 60_000; }, cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
}
for (const [name, mutate] of [
  ['absent approval', () => {}],
  ['expired approval', f => { f.approve(); f.expire(); }],
  ['altered question', (f, r) => { f.approve(); r.context.req.body.message += ' changed'; }],
  ['wrong user', (f, r) => { f.approve(); r.context.req.compatAuth.userId = 'other'; }],
  ['wrong course', (f, r) => { f.approve(); r.context.req.body.activeCourseId = 'other'; }],
  ['different conversation ID', (f, r) => { f.approve(); r.context.req.body.conversationId = 'new-conversation'; }],
  ['changed model', (f, r) => { f.approve(); r.payload.model = 'other-model'; }],
  ['approval over 30 minutes', f => { f.approved.expires_at = new Date(Date.parse(f.approved.issued_at) + 31 * 60_000).toISOString(); f.approve(); }],
]) test(`offline gate rejects ${name} before provider transport`, () => {
  const f = fixture(); try { const r = f.request(1); mutate(f, r); assert.throws(() => f.gate.consume(r.payload, r.context)); assert.equal(f.gate.count(), 0); } finally { f.cleanup(); }
});
test('Turn 2 requires the actual first exchange, not supplied/reconstructed history', () => {
  const f = fixture(); try {
    f.approve(); const missing = f.request(2); assert.throws(() => f.gate.consume(missing.payload, missing.context), /first_live_turn_missing/);
    const actual = f.firstResponse();
    const wrong = f.request(2, [{ role: 'user', content: f.frozen.turns[0].query }, { role: 'assistant', content: 'invented answer' }]);
    assert.throws(() => f.gate.consume(wrong.payload, wrong.context), /previous_exchange_missing_or_changed/);
    const correct = f.request(2, [{ role: 'user', content: f.frozen.turns[0].query }, { role: 'assistant', content: actual }]);
    assert.equal(f.gate.consume(correct.payload, correct.context), 1);
  } finally { f.cleanup(); }
});
test('four-attempt ledger spans both turns, survives restart and blocks a fifth attempt', () => {
  const f = fixture(); try {
    f.approve(); const one = f.request(1);
    assert.equal(f.gate.consume(one.payload, one.context), 1);
    assert.equal(f.gate.consume(one.payload, one.context), 2);
    const actual = f.firstResponse(); const restarted = createGate(f.options);
    const two = f.request(2, [{ role: 'user', content: f.frozen.turns[0].query }, { role: 'assistant', content: actual }]);
    assert.equal(restarted.consume(two.payload, two.context), 3);
    assert.equal(restarted.consume(two.payload, two.context), 4);
    assert.throws(() => restarted.consume(two.payload, two.context), /budget_exhausted/);
    assert.equal(restarted.count(), 4);
  } finally { f.cleanup(); }
});
test('provider payload must retain the first actual exchange', () => {
  const f = fixture(); try {
    f.approve(); const actual = f.firstResponse(); const r = f.request(2, [{ role: 'user', content: f.frozen.turns[0].query }, { role: 'assistant', content: actual }]);
    r.payload.messages.splice(1, 2);
    assert.throws(() => f.gate.consume(r.payload, r.context), /provider_payload_or_history_mismatch/);
    assert.equal(f.gate.count(), 0);
  } finally { f.cleanup(); }
});
test('changed frozen bytes fail closed', () => {
  const f = fixture(); try {
    f.approve(); fs.appendFileSync(path.join(f.options.directory, 'case.json'), ' ');
    assert.equal(f.gate.approval(), null); assert.throws(() => createGate(f.options), /checksum/);
  } finally { f.cleanup(); }
});
test('memory review cannot mark fallback or absent provider transport as a genuine test', () => {
  assert.equal(evaluate([], []).memoryEvaluated, false);
  const turn = { number: 1, httpStatus: 200, response: { provider: 'built-in-course-guide', outcome: { liveModelAnswer: false } } };
  assert.equal(evaluate([turn, { ...turn, number: 2 }], []).allTurnsReachedProvider, false);
});
