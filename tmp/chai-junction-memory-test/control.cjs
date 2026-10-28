const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { createGate, backendRequire, backendRoot, sha } = require('./gate.cjs');
const base = 'http://127.0.0.1:3129';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function writeJson(file, data) {
  const temporary = file + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temporary, file);
}
async function json(url, options = {}) {
  const target = new URL(url);
  if (target.origin !== base) throw Error('Only the isolated loopback API is allowed');
  const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(60_000) });
  return { status: response.status, data: await response.json() };
}
async function check(gate) {
  const ready = await json(base + '/api/ready');
  const running = await json(base + '/__local_retest/status');
  if (ready.status !== 200 || running.status !== 200 || running.data.productionConfigLoaded !== false
    || running.data.database !== 'mongodb://127.0.0.1:27028/skillomate_lba_manual_retest') throw Error('Isolated backend is not ready');
  for (const [file, checksum] of Object.entries(running.data.sources)) {
    if (sha(fs.readFileSync(path.join(backendRoot, file))) !== checksum) throw Error('Loaded local source differs from current source');
  }
  const client = new (backendRequire('mongodb').MongoClient)('mongodb://127.0.0.1:27028/skillomate_lba_manual_retest', { directConnection: true, serverSelectionTimeoutMS: 4000 });
  try {
    await client.connect();
    const { ObjectId } = backendRequire('mongodb');
    const user = await client.db().collection('users').findOne({ _id: new ObjectId(gate.frozen.user_id) });
    if (!user || user.mobileNumber !== '919000000002' || user.isActive === false
      || !user.activeSessionId || !user.courseEntitlements?.some(item => String(item.course) === gate.frozen.course_id)) throw Error('Expected local test session/course grant missing');
    const subscription = await client.db().collection('subscriptions').findOne({ user: user._id });
    if (subscription?.status !== 'active' || new Date(subscription.currentPeriodEnd).getTime() <= Date.now()) throw Error('Local premium entitlement inactive');
    const course = await client.db().collection('courses').findOne({ _id: new ObjectId(gate.frozen.course_id), status: 'published' });
    if (!course) throw Error('Published local course missing');
  } finally { await client.close(); }
  const value = { backendUrl: base, backendReady: true, isolatedDatabaseReady: true,
    userId: gate.frozen.user_id, testAccountHasActiveSession: true, entitledCourseId: gate.frozen.course_id,
    loadedSourceVerified: true, providerKeyConfigured: Boolean(gate.configured.key), model: gate.frozen.model,
    approvalGranted: Boolean(gate.approval()), providerAttempts: gate.count(), maxProviderAttempts: 4,
    casesSHA256: gate.hash, liveExecution: 'not executed by readiness check' };
  writeJson(path.join(__dirname, 'readiness.json'), value);
  return value;
}
async function approve(gate) {
  if (!gate.configured.key) throw Error('Existing provider key is missing');
  if (gate.count() || fs.existsSync(path.join(__dirname, 'run.lock'))) throw Error('This memory test was already used; its ledger cannot be reset');
  const now = Date.now();
  const value = { approved: true, approval_id: crypto.randomUUID(), model: gate.frozen.model,
    cases_sha256: gate.hash, turns_sha256: sha(JSON.stringify(gate.frozen.turns)),
    course_id: gate.frozen.course_id, user_id: gate.frozen.user_id, conversation_id: gate.frozen.conversation_id,
    max_calls: 4, issued_at: new Date(now).toISOString(), expires_at: new Date(now + 30 * 60_000).toISOString() };
  writeJson(gate.approvalPath, value);
  console.log(JSON.stringify({ approvalGranted: true, model: value.model, maxProviderAttempts: 4,
    conversationId: value.conversation_id, expiresAt: value.expires_at, paidCallsExecuted: 0 }, null, 2));
}
async function live(gate) {
  if (!gate.approval()) throw Error('Explicit two-turn approval is absent or expired. No paid calls executed.');
  if (!gate.configured.key || gate.count() >= 4) throw Error('Provider unavailable or four-attempt budget exhausted');
  await check(gate);
  const running = (await json(base + '/__local_retest/status')).data;
  if (running.approved && running.profile !== 'LBA-MEMORY-02TURN') throw Error('Another approved local test is active; refusing to replace it');
  const lock = fs.openSync(path.join(__dirname, 'run.lock'), 'wx', 0o600);
  fs.writeFileSync(lock, JSON.stringify({ startedAt: new Date().toISOString(), casesSHA256: gate.hash })); fs.closeSync(lock);
  const turns = [];
  function result(error) {
    const { evaluate } = require('./evaluate.cjs');
    const events = fs.existsSync(gate.tracePath) ? fs.readFileSync(gate.tracePath, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
    const report = { executedAt: new Date().toISOString(), backendUrl: base, model: gate.frozen.model,
      casesSHA256: gate.hash, userId: gate.frozen.user_id, courseId: gate.frozen.course_id,
      conversationId: gate.frozen.conversation_id, providerAttempts: gate.count(), maxProviderAttempts: 4,
      turns, evaluation: evaluate(turns, events), ...(error ? { error: error.message } : {}) };
    writeJson(path.join(__dirname, 'live-result.json'), report);
    return report;
  }
  try {
    if (running.profile !== 'LBA-MEMORY-02TURN') {
      process.kill(running.pid, 'SIGINT');
      for (let i = 0; i < 30; i++) {
        try { await json(base + '/__local_retest/status'); await delay(100); } catch { break; }
      }
      const log = fs.openSync(path.join(__dirname, 'backend.log'), 'a', 0o600);
      const child = spawn(process.execPath, [path.join(__dirname, 'server.cjs')], { cwd: backendRoot, detached: true, stdio: ['ignore', log, log] });
      child.unref(); fs.closeSync(log);
    }
    let ready;
    for (let i = 0; i < 50; i++) {
      try {
        const status = await json(base + '/__memory_live/status'), health = await json(base + '/api/ready');
        if (status.data.profile === 'LBA-MEMORY-02TURN' && status.data.casesSHA256 === gate.hash && health.status === 200) { ready = status.data; break; }
      } catch {}
      await delay(100);
    }
    if (!ready || ready.classifierHash !== running.classifierHash) throw Error('Memory-test backend or verified classifier is not ready');
    for (const [file, checksum] of Object.entries(ready.sources)) {
      if (sha(fs.readFileSync(path.join(backendRoot, file))) !== checksum) throw Error('Loaded source fingerprint mismatch');
    }
    const login = await json(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: '9000000002', password: 'LocalRetest02!' }) });
    if (login.status !== 200 || login.data._id !== gate.frozen.user_id) throw Error('Local synthetic-account authentication failed');
    const headers = { Authorization: `Bearer ${login.data.accessToken}`, 'Content-Type': 'application/json', 'x-memory-live-case': gate.hash };
    const auth = await json(base + '/api/ai/health', { headers }), courses = await json(base + '/api/ai/courses', { headers });
    if (auth.status !== 200 || !courses.data.some(course => course.id === gate.frozen.course_id)) throw Error('Authenticated local course unavailable');
    let history = [];
    for (const turn of gate.frozen.turns) {
      const request = { message: turn.query, activeCourseId: gate.frozen.course_id,
        history, conversationId: gate.frozen.conversation_id, assistantName: 'Nex AI', debugAi: true };
      gate.event('memory_turn_request', { turn: turn.number, endpoint: base + '/api/ai/chat', conversation_id: request.conversationId, request });
      // Each turn is submitted once. All provider retries/repairs use the normal
      // backend transport and consume the shared four-attempt ledger.
      const answer = await json(base + '/api/ai/chat', { method: 'POST',
        headers: { ...headers, 'x-memory-turn': String(turn.number) }, body: JSON.stringify(request) });
      const recorded = { number: turn.number, request, httpStatus: answer.status, response: answer.data,
        providerAttemptsSoFar: gate.count() };
      turns.push(recorded); writeJson(path.join(__dirname, `turn-${turn.number}.json`), recorded);
      if (answer.status !== 200 || answer.data.provider !== 'fal-openrouter' || answer.data.outcome?.liveModelAnswer !== true
        || answer.data.debug?.resolved_active_course_id !== gate.frozen.course_id) throw Error(`Turn ${turn.number} did not return a genuine course-scoped live answer; memory test stopped`);
      // Preserve the actual first answer, never a fixture or a reconstructed answer.
      if (turn.number === 1) history = [{ role: 'user', content: turn.query }, { role: 'assistant', content: answer.data.answer }];
    }
    const report = result();
    console.log(JSON.stringify({ resultFile: path.join(__dirname, 'live-result.json'),
      providerAttempts: report.providerAttempts, evaluation: report.evaluation }, null, 2));
    if (!report.evaluation.allTurnsReachedProvider || !report.evaluation.automatedContentChecksPass) process.exitCode = 1;
  } catch (error) { result(error); throw error; }
  finally {
    const previous = JSON.parse(fs.readFileSync(gate.approvalPath));
    writeJson(gate.approvalPath, { ...previous, approved: false, closed_at: new Date().toISOString(), attempts_used: gate.count() });
  }
}
async function main() {
  const gate = createGate();
  if (process.argv[2] === 'check') console.log(JSON.stringify(await check(gate), null, 2));
  else if (process.argv[2] === 'approve') await approve(gate);
  else if (process.argv[2] === 'live') await live(gate);
  else throw Error('Usage: node control.cjs check|approve|live');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
