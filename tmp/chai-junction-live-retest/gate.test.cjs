const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createGate, sha } = require('./gate.cjs');
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chai-gate-offline-'));
  for (const name of ['case.json', 'case.sha256']) fs.copyFileSync(path.join(__dirname, name), path.join(directory, name));
  const frozen = JSON.parse(fs.readFileSync(path.join(directory, 'case.json')));
  let time = Date.now();
  const options = { directory, configured: { key: 'offline-fixture-key', model: frozen.model, url: frozen.provider_url }, now: () => time };
  const gate = createGate(options);
  const approval = { approved: true, model: frozen.model, cases_sha256: gate.hash,
    question_sha256: sha(gate.question), course_id: frozen.course_id, user_id: frozen.user_id,
    max_calls: 2, issued_at: new Date(time).toISOString(), expires_at: new Date(time + 30 * 60_000).toISOString() };
  const write = value => fs.writeFileSync(gate.approvalPath, JSON.stringify(value));
  const payload = { model: frozen.model, max_tokens: 900, messages: [{ role: 'user', content: gate.question }] };
  const context = { path: '/api/ai/chat', req: { method: 'POST', headers: { 'x-single-live-case': gate.hash },
    body: { message: gate.question, activeCourseId: frozen.course_id, history: [], conversationId: 'offline-test' }, compatAuth: { userId: frozen.user_id } },
    knowledge: { activeCourse: { id: frozen.course_id }, materialsAvailable: true, conversationHistory: [] } };
  return { gate, payload, context, write, approval, options, expire: () => { time += 31 * 60_000; }, cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
}
for (const [name, mutate] of [
  ['missing approval', () => {}],
  ['expired approval', f => { f.write(f.approval); f.expire(); }],
  ['changed question', f => { f.write(f.approval); f.context.req.body.message += ' Changed'; }],
  ['changed model', f => { f.write(f.approval); f.payload.model = 'another-model'; }],
  ['wrong course', f => { f.write(f.approval); f.context.req.body.activeCourseId = 'other'; }],
  ['wrong authenticated user', f => { f.write(f.approval); f.context.req.compatAuth.userId = 'other'; }],
  ['existing conversation history', f => { f.write(f.approval); f.context.req.body.history.push({ role: 'user', content: 'old message' }); }],
  ['approval longer than 30 minutes', f => { f.approval.expires_at = new Date(Date.parse(f.approval.issued_at) + 31 * 60_000).toISOString(); f.write(f.approval); }],
]) test(`offline gate rejects ${name} without debiting an attempt`, () => {
  const f = fixture(); try { mutate(f); assert.throws(() => f.gate.consume(f.payload, f.context)); assert.equal(f.gate.count(), 0); } finally { f.cleanup(); }
});
test('offline accounting survives restart and prevents a third attempt', () => {
  const f = fixture(); try {
    f.write(f.approval);
    assert.equal(f.gate.consume(f.payload, f.context), 1);
    const restarted = createGate(f.options);
    assert.equal(restarted.consume(f.payload, f.context), 2);
    assert.throws(() => restarted.consume(f.payload, f.context), /budget_exhausted/);
    assert.equal(restarted.count(), 2);
  } finally { f.cleanup(); }
});
test('offline gate rejects changed frozen case bytes', () => {
  const f = fixture(); try {
    f.write(f.approval); fs.appendFileSync(path.join(f.options.directory, 'case.json'), ' ');
    assert.equal(f.gate.approval(), null);
    assert.throws(() => createGate(f.options), /checksum/);
  } finally { f.cleanup(); }
});
