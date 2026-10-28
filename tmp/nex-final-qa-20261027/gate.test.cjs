const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createGate, sha, LOCAL } = require('./gate.cjs');
const { guardHandler } = require('./guard.cjs');
const { requestTutorProvider } = require('../../edunex-b/services/tutorProvider');
const { tutorUnavailable } = require('../../edunex-b/services/tutorAvailability');
const { backend } = require('../../edunex-b/tests/ai-tutor-fixture.cjs');
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-qa-gate-offline-'));
  for (const file of ['session.json', 'session.sha256', 'source-revision.json', 'provider_attempts.jsonl']) fs.copyFileSync(path.join(__dirname, file), path.join(directory, file));
  fs.writeFileSync(path.join(directory, 'pipeline_traces.jsonl'), '');
  const frozen = JSON.parse(fs.readFileSync(path.join(directory, 'session.json')));
  let time = Date.now();
  const options = { directory, configured: { key: 'OFFLINE-FIXTURE', model: frozen.model, url: frozen.provider_url }, now: () => time };
  const gate = createGate(options);
  const req = { method: 'POST', headers: { host: '127.0.0.1:3129' }, socket: { remoteAddress: '127.0.0.1', localAddress: '127.0.0.1' },
    compatAuth: { userId: frozen.user_id }, body: { activeCourseId: frozen.course_id, conversationId: 'nai-first', message: 'An unseen question', history: [] } };
  const context = { req, path: '/api/ai/chat', environment: LOCAL, requestId: 'offline-request', knowledge: { activeCourse: { id: frozen.course_id }, materialsAvailable: true } };
  const payload = { model: frozen.model, max_tokens: 900, messages: [{ role: 'system', content: 'Authorized offline course context' }, { role: 'user', content: req.body.message }] };
  return { directory, gate, frozen, options, req, context, payload,
    authorize: () => gate.authorize(gate.hash), advance: ms => { time += ms; },
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
}
const withFixture = (fn) => { const f = fixture(); try { return fn(f); } finally { f.cleanup(); } };
test('session starts closed with all 12 attempts remaining', () => withFixture(f => {
  assert.equal(f.gate.status().approved, false); assert.equal(f.gate.status().remainingProviderAttempts, 12);
  assert.throws(() => f.gate.consume(f.payload, f.context), { code: 'manual_qa_awaiting_approval' });
  assert.equal(f.gate.count(), 0);
}));
test('different questions, corrections, histories and conversations share one authorization and ledger', () => withFixture(f => {
  f.authorize();
  const messages = ['Meri photo mein reflection wrong hai. Kya karu?', 'Actually the bottle is amber. Preserve that colour.', 'How should I plan a tiny shop ad?'];
  messages.forEach((question, index) => {
    f.req.body.message = question; f.req.body.conversationId = index < 2 ? 'nai-one' : 'nai-new';
    f.req.body.history = index === 1 ? [{ role: 'user', content: messages[0] }, { role: 'assistant', content: 'Actual prior fixture answer' }] : [];
    f.payload.messages = [{ role: 'system', content: 'Authorized context' }, ...f.req.body.history, { role: 'user', content: question }];
    assert.equal(f.gate.consume(f.payload, f.context), index + 1);
  });
  assert.equal(f.gate.status().approved, true); assert.equal(f.gate.count(), 3);
}));
test('12 attempts persist through fresh gate instances; the 13th is rejected without ledger reset', () => withFixture(f => {
  f.authorize();
  for (let i = 1; i <= 12; i++) assert.equal(createGate(f.options).consume(f.payload, f.context), i);
  const restarted = createGate(f.options);
  assert.equal(restarted.count(), 12); assert.equal(restarted.status().remainingProviderAttempts, 0);
  assert.throws(() => restarted.consume(f.payload, f.context), { code: 'manual_qa_budget_exhausted' });
  assert.throws(() => restarted.authorize(restarted.hash), { code: 'manual_qa_invalid_approval' });
  assert.equal(restarted.count(), 12);
}));
test('expiry is exactly 60 minutes and is preserved across restarts', () => withFixture(f => {
  const approval = f.authorize(); assert.equal(Date.parse(approval.expires_at) - Date.parse(approval.issued_at), 60 * 60000);
  f.advance(60 * 60000 - 1); assert.equal(f.gate.consume(f.payload, f.context), 1);
  f.advance(1); assert.throws(() => createGate(f.options).consume(f.payload, f.context), { code: 'manual_qa_expired' });
  assert.equal(f.gate.count(), 1); assert.throws(() => f.authorize(), { code: 'manual_qa_invalid_approval' });
}));
for (const [name, mutate, code] of [
  ['wrong account', f => { f.req.compatAuth.userId = 'different'; f.req.body.userId = f.frozen.user_id; }, 'scope_denied'],
  ['wrong course', f => { f.req.body.activeCourseId = 'other-course'; }, 'scope_denied'],
  ['conflicting course selectors', f => { f.req.body.courseId = 'other-course'; }, 'scope_denied'],
  ['missing active course', f => { delete f.req.body.activeCourseId; }, 'scope_denied'],
  ['unauthorized retrieved course', f => { f.context.knowledge.activeCourse.id = 'other'; }, 'scope_denied'],
  ['expired entitlement', f => { f.context.knowledge.materialsAvailable = false; }, 'scope_denied'],
  ['wrong model', f => { f.payload.model = 'unapproved-model'; }, 'model_mismatch'],
  ['production runtime', f => { f.context.environment = { ...LOCAL, nodeEnv: 'production' }; }, 'environment_mismatch'],
  ['production database', f => { f.context.environment = { ...LOCAL, database: 'mongodb://production.invalid/db' }; }, 'environment_mismatch'],
  ['wrong local port', f => { f.context.environment = { ...LOCAL, port: 3000 }; }, 'environment_mismatch'],
  ['production Host header', f => { f.req.headers.host = 'api.skillomate.in'; }, 'environment_mismatch'],
  ['external peer address', f => { f.req.socket.remoteAddress = '203.0.113.8'; }, 'environment_mismatch'],
  ['wrong HTTP path', f => { f.context.path = '/api/unrelated'; }, 'environment_mismatch'],
  ['wrong HTTP method', f => { f.req.method = 'GET'; }, 'environment_mismatch'],
  ['oversized token limit', f => { f.payload.max_tokens = 901; }, 'invalid_payload'],
]) test(`session rejects ${name} before any paid attempt`, () => withFixture(f => {
  f.authorize(); mutate(f); assert.throws(() => f.gate.consume(f.payload, f.context), { code: 'manual_qa_' + code }); assert.equal(f.gate.count(), 0);
}));
for (const [name, mutate] of [
  ['more than 12 attempts', value => { value.max_calls = 13; }],
  ['more than 60 minutes', value => { value.expires_at = new Date(Date.parse(value.issued_at) + 61 * 60000).toISOString(); }],
  ['different account', value => { value.user_id = 'other'; }],
  ['different session', value => { value.session_id = 'other'; }],
]) test(`approval cannot be enlarged or moved: ${name}`, () => withFixture(f => {
  f.authorize(); const value = JSON.parse(fs.readFileSync(f.gate.approvalPath)); mutate(value);
  fs.writeFileSync(f.gate.approvalPath, JSON.stringify(value));
  assert.throws(() => f.gate.consume(f.payload, f.context), { code: 'manual_qa_invalid_approval' }); assert.equal(f.gate.count(), 0);
}));
test('explicit close preserves accounting and prevents reauthorization of the same ledger', () => withFixture(f => {
  f.authorize(); f.gate.consume(f.payload, f.context); f.gate.close();
  assert.equal(f.gate.count(), 1); assert.throws(() => f.gate.consume(f.payload, f.context), { code: 'manual_qa_closed' });
  assert.throws(() => f.authorize(), { code: 'manual_qa_invalid_approval' });
}));
test('missing, truncated or altered ledgers fail closed instead of becoming zero', () => {
  for (const alter of [file => fs.unlinkSync(file), file => fs.writeFileSync(file, ''), file => fs.appendFileSync(file, '{'),
    file => fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('session_initialized', 'reset'))]) withFixture(f => {
    alter(f.gate.ledgerPath); assert.throws(() => createGate(f.options), { code: 'manual_qa_ledger_invalid' });
  });
});
test('simultaneous accounting lock fails closed and does not consume or reset attempts', () => withFixture(f => {
  f.authorize(); const lock = path.join(f.directory, 'provider_accounting.lock'); fs.writeFileSync(lock, 'other writer', { flag: 'wx' });
  assert.throws(() => f.gate.consume(f.payload, f.context), { code: 'manual_qa_accounting_busy' }); assert.equal(f.gate.count(), 0);
  fs.unlinkSync(lock); assert.equal(f.gate.consume(f.payload, f.context), 1);
}));
test('separate restarted processes share the same non-resettable 12-attempt counter', () => withFixture(f => {
  f.authorize();
  const source = `const fs=require('fs');const {createGate,LOCAL}=require(${JSON.stringify(require.resolve('./gate.cjs'))});
    const directory=process.argv[1],s=JSON.parse(fs.readFileSync(directory+'/session.json'));
    const g=createGate({directory,configured:{key:'offline',model:s.model,url:s.provider_url}});
    const context={path:'/api/ai/chat',environment:LOCAL,req:{method:'POST',headers:{host:'127.0.0.1:3129'},socket:{localAddress:'127.0.0.1',remoteAddress:'127.0.0.1'},compatAuth:{userId:s.user_id},body:{activeCourseId:s.course_id,conversationId:'new-process',message:'Another question',history:[]}},knowledge:{activeCourse:{id:s.course_id},materialsAvailable:true}};
    const payload={model:s.model,max_tokens:900,messages:[{role:'system',content:'Offline context'}]};
    for(let i=0;i<7;i++){try{g.consume(payload,context)}catch(e){if(e.code!=='manual_qa_budget_exhausted')throw e;break}}
    process.stdout.write(String(g.count()));`;
  const { execFileSync } = require('node:child_process');
  assert.equal(execFileSync(process.execPath, ['-e', source, f.directory], { encoding: 'utf8' }), '7');
  assert.equal(execFileSync(process.execPath, ['-e', source, f.directory], { encoding: 'utf8' }), '12');
  assert.equal(f.gate.count(), 12);
}));
test('client QA flags cannot grant approval or enlarge the session budget', () => withFixture(f => {
  Object.assign(f.req.body, { approved: true, max_calls: 999, expires_at: '2099-01-01T00:00:00Z' });
  assert.throws(() => f.gate.consume(f.payload, f.context), { code: 'manual_qa_awaiting_approval' });
  assert.equal(f.gate.count(), 0);
}));
test('normal adapter retries and repairs debit the same persistent session budget', async () => {
  const f = fixture(); try {
    f.authorize(); let calls = 0;
    const fetchImpl = async () => { f.gate.consume(f.payload, f.context); calls++;
      if (calls === 1) return { ok: false, status: 503 };
      return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ text: 'Offline answer' }) }; };
    await requestTutorProvider({ url: f.frozen.provider_url, key: 'offline', payload: f.payload, fetchImpl, extractText: value => value.text, sleep: async () => {} });
    await requestTutorProvider({ url: f.frozen.provider_url, key: 'offline', payload: f.payload, fetchImpl, extractText: value => value.text, maxAttempts: 1 });
    assert.equal(calls, 3); assert.equal(createGate(f.options).count(), 3);
  } finally { f.cleanup(); }
});
test('an exhausted session or expired approval is not retried as a connection failure', async () => {
  const f = fixture(); try {
    f.authorize(); for (let i = 0; i < 12; i++) f.gate.consume(f.payload, f.context);
    let boundaries = 0;
    await assert.rejects(requestTutorProvider({ url: f.frozen.provider_url, key: 'offline', payload: f.payload,
      fetchImpl: async () => { boundaries++; f.gate.consume(f.payload, f.context); }, extractText: () => '', sleep: async () => {} }),
      e => e.code === 'manual_qa_budget_exhausted' && e.diagnostics.attempts.length === 1);
    assert.equal(boundaries, 1); assert.equal(f.gate.count(), 12);
  } finally { f.cleanup(); }
});
test('wrong account/course is rejected before any tutor/retrieval handler runs', async () => {
  const f = fixture(); try {
    let handlerCalls = 0, status, data;
    const guarded = guardHandler(f.gate, LOCAL, () => '/api/ai/chat', async () => { handlerCalls++; }, tutorUnavailable);
    const res = { status(value) { status = value; return this; }, json(value) { data = value; return value; } };
    f.req.compatAuth.userId = 'wrong'; await guarded(f.req, res); assert.equal(status, 403); assert.equal(handlerCalls, 0);
    assert.equal(data.outcome.providerStatus, 'manual_qa_scope_denied'); assert.equal(data.outcome.failureClass, 'authorization');
  } finally { f.cleanup(); }
});
test('manual QA block reporting is clear and distinct from real provider failures', () => {
  assert.match(tutorUnavailable('manual_qa_awaiting_approval').error, /awaiting session approval/);
  assert.match(tutorUnavailable('manual_qa_expired').error, /60-minute.*expired/);
  assert.match(tutorUnavailable('manual_qa_budget_exhausted').error, /budget is exhausted/);
  assert.equal(tutorUnavailable('manual_qa_expired').outcome.failureClass, 'approval');
  assert.equal(tutorUnavailable('connection_error').outcome.failureClass, 'infrastructure');
  assert.equal(tutorUnavailable('empty_response').outcome.failureClass, 'model_response');
});
test('normal production routes do not import or depend on the development QA gate', async () => {
  for (const file of ['server.js', 'routes/ai.js', 'middleware/compatAuth.js']) {
    assert.doesNotMatch(fs.readFileSync(path.resolve(__dirname, '../../edunex-b', file), 'utf8'), /nex-manual-qa-session|manualQaGate/);
  }
  const api = backend({ reply: 'Normal offline provider answer.' });
  const result = await api.rawChat({ message: 'Explain a concept briefly.' });
  assert.equal(result.statusCode, 200); assert.equal(api.calls.length, 1); assert.equal(result.result.provider, 'fal-openrouter');
  assert.equal((await api.request('POST', '/chat', { message: 'Explain' }, false)).statusCode, 401);
});
test('development launcher refuses a production-mode start before opening the backend', () => {
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(process.execPath, [path.join(__dirname, 'server.cjs')], {
    env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf8', timeout: 5000,
  });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /refuses production mode/);
});
