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
    approvalGranted: Boolean(gate.approval()), providerAttempts: gate.count(), maxProviderAttempts: 2,
    casesSHA256: gate.hash, liveExecution: 'not executed by readiness check' };
  writeJson(path.join(__dirname, 'readiness.json'), value);
  return value;
}
async function approve(gate) {
  if (!gate.configured.key) throw Error('Existing provider key is missing');
  if (gate.count() || fs.existsSync(path.join(__dirname, 'run.lock'))) throw Error('This one-question run was already used; its attempt budget cannot be reset');
  const now = Date.now();
  const value = { approved: true, approval_id: crypto.randomUUID(), model: gate.frozen.model,
    cases_sha256: gate.hash, question_sha256: sha(gate.question), course_id: gate.frozen.course_id,
    user_id: gate.frozen.user_id, max_calls: 2, issued_at: new Date(now).toISOString(),
    expires_at: new Date(now + 30 * 60_000).toISOString() };
  writeJson(gate.approvalPath, value);
  console.log(JSON.stringify({ approvalGranted: true, model: value.model, maxProviderAttempts: 2,
    expiresAt: value.expires_at, paidCallsExecuted: 0 }, null, 2));
}
async function live(gate) {
  // Refuse before touching the running backend when approval is absent.
  if (!gate.approval()) throw Error('Explicit approval is absent or expired. No paid calls executed.');
  if (!gate.configured.key || gate.count() >= 2) throw Error('Provider unavailable or attempt budget exhausted');
  await check(gate);
  const lock = fs.openSync(path.join(__dirname, 'run.lock'), 'wx', 0o600);
  fs.writeFileSync(lock, JSON.stringify({ startedAt: new Date().toISOString(), casesSHA256: gate.hash }));
  fs.closeSync(lock);
  let report;
  try {
    const running = (await json(base + '/__local_retest/status')).data;
    if (running.profile !== 'LBA-MANUAL-02-single-live') {
      process.kill(running.pid, 'SIGINT');
      for (let i = 0; i < 30; i++) {
        try { await json(base + '/__local_retest/status'); await delay(100); }
        catch { break; }
      }
      const log = fs.openSync(path.join(__dirname, 'backend.log'), 'a', 0o600);
      const child = spawn(process.execPath, [path.join(__dirname, 'server.cjs')], {
        cwd: backendRoot, detached: true, stdio: ['ignore', log, log],
      });
      child.unref(); fs.closeSync(log);
    }
    let ready;
    for (let i = 0; i < 50; i++) {
      try {
        const status = await json(base + '/__single_live/status');
        const health = await json(base + '/api/ready');
        if (status.data.profile === 'LBA-MANUAL-02-single-live' && status.data.casesSHA256 === gate.hash && health.status === 200) { ready = status.data; break; }
      } catch {}
      await delay(100);
    }
    if (!ready) throw Error('Gated local backend did not become ready');
    if (ready.classifierHash !== running.classifierHash) throw Error('Gated backend classifier differs from the verified local process');
    for (const [file, checksum] of Object.entries(ready.sources)) {
      if (sha(fs.readFileSync(path.join(backendRoot, file))) !== checksum) throw Error('Gated backend source fingerprint mismatch');
    }
    const login = await json(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: '9000000002', password: 'LocalRetest02!' }) });
    if (login.status !== 200 || login.data._id !== gate.frozen.user_id) throw Error('Local test authentication failed');
    const headers = { Authorization: `Bearer ${login.data.accessToken}`, 'Content-Type': 'application/json', 'x-single-live-case': gate.hash };
    const auth = await json(base + '/api/ai/health', { headers });
    const courses = await json(base + '/api/ai/courses', { headers });
    if (auth.status !== 200 || !courses.data.some(course => course.id === gate.frozen.course_id)) throw Error('Authenticated local course is unavailable');
    const request = { message: gate.question, activeCourseId: gate.frozen.course_id,
      history: [], conversationId: 'lba-manual-02-live-' + crypto.randomUUID(), assistantName: 'Nex AI', debugAi: true };
    gate.event('single_question_request', { endpoint: base + '/api/ai/chat', request });
    // Exactly one application request. Provider retries/repairs remain in the
    // normal requestTutorProvider path and each transport is debited by the gate.
    const answer = await json(base + '/api/ai/chat', { method: 'POST', headers, body: JSON.stringify(request) });
    writeJson(path.join(__dirname, 'actual-response.json'), answer);
    report = { executedAt: new Date().toISOString(), backendUrl: base, model: gate.frozen.model,
      casesSHA256: gate.hash, userId: gate.frozen.user_id, courseId: gate.frozen.course_id,
      conversationId: request.conversationId, request, httpStatus: answer.status, response: answer.data,
      providerAttempts: gate.count(), genuineLiveAnswer: answer.data.provider === 'fal-openrouter' && answer.data.outcome?.liveModelAnswer === true,
      note: 'Actual provider output is also retained in pipeline_traces.jsonl; a fallback or local replacement is not a successful live answer.' };
    writeJson(path.join(__dirname, 'live-result.json'), report);
    console.log(JSON.stringify({ resultFile: path.join(__dirname, 'live-result.json'),
      responseFile: path.join(__dirname, 'actual-response.json'), provider: answer.data.provider,
      providerAttempts: gate.count(), genuineLiveAnswer: report.genuineLiveAnswer }, null, 2));
    if (answer.status !== 200 || !report.genuineLiveAnswer) process.exitCode = 1;
  } catch (error) {
    writeJson(path.join(__dirname, 'live-result.json'), { error: error.message, providerAttempts: gate.count(), genuineLiveAnswer: false });
    throw error;
  } finally {
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
