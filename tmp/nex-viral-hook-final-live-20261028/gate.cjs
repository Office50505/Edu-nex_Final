// Development launcher only. Reuses the existing configuration/approval schema
// and fsync-before-transport accounting, with session rather than question scope.
const fs = require('node:fs');
const path = require('node:path');
const { providerConfig, backendRoot, backendRequire, sha } = require('../chai-junction-live-retest/gate.cjs');
const LIMIT = 3, DURATION = 30 * 60_000;
const LOCAL = Object.freeze({ nodeEnv: 'development', backendUrl: 'http://127.0.0.1:3129', host: '127.0.0.1', port: 3129,
  database: 'mongodb://127.0.0.1:27028/skillomate_lba_final_qa_20261027', redis: 'redis://127.0.0.1:6388/1',
  workspaceRoot: path.resolve(backendRoot, '..'), productionConfigLoaded: false, backgroundJobsEnabled: false });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const loopback = address => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
class ManualQaError extends Error {
  constructor(code) { super(code); this.code = code; this.name = 'ManualQaError'; }
}
const fail = code => { throw new ManualQaError(code); };

function createGate({ directory = __dirname, configured = providerConfig(), now = Date.now } = {}) {
  const bytes = fs.readFileSync(path.join(directory, 'session.json'));
  const hash = sha(bytes), frozen = JSON.parse(bytes);
  if (fs.readFileSync(path.join(directory, 'session.sha256'), 'utf8').trim() !== hash
    || frozen.schema_version !== 1 || frozen.max_provider_attempts !== LIMIT || frozen.approval_duration_minutes !== 30
    || !same(frozen.environment, LOCAL) || !/^[\da-f-]{36}$/i.test(frozen.session_id)
    || frozen.user_id !== '6addcefc5d47d548973c29b9' || frozen.course_id !== '6ae1b4694e1af14d4adc9e2b'
    || !same(frozen.allowed_paths, ['/api/ai/chat', '/api/course-ai/chat'])
    || frozen.model !== configured.model || frozen.provider_url !== configured.url
    || configured.url !== 'https://fal.run/openrouter/router/openai/v1/chat/completions') fail('manual_qa_invalid_session');
  const ledgerPath = path.join(directory, 'provider_attempts.jsonl');
  const tracePath = path.join(directory, 'pipeline_traces.jsonl');
  const approvalPath = path.join(directory, 'provider_approval.json');
  const lockPath = path.join(directory, 'provider_accounting.lock');
  const environmentHash = sha(JSON.stringify(frozen.environment));
  function unchanged() {
    try {
      if (sha(fs.readFileSync(path.join(directory, 'session.json'))) !== hash) fail('manual_qa_invalid_session');
      const revisionBytes = fs.readFileSync(path.join(directory, 'source-revision.json'));
      if (sha(revisionBytes) !== frozen.source_revision_sha256) fail('manual_qa_invalid_session');
      const revision = JSON.parse(revisionBytes);
      for (const [file, expected] of Object.entries(revision.sources)) {
        if (sha(fs.readFileSync(path.resolve(backendRoot, '..', file))) !== expected) fail('manual_qa_invalid_session');
      }
    }
    catch { fail('manual_qa_invalid_session'); }
  }
  function ledger() {
    try {
      const text = fs.readFileSync(ledgerPath, 'utf8');
      if (!text.endsWith('\n')) fail('manual_qa_ledger_invalid');
      const entries = text.trim().split('\n').map(line => JSON.parse(line));
      let previousHash = '';
      for (let i = 0; i < entries.length; i++) {
        const { digest, ...record } = entries[i];
        if (record.session_id !== frozen.session_id || record.session_sha256 !== hash || record.sequence !== i
          || record.previous_hash !== previousHash || digest !== sha(JSON.stringify(record))
          || record.type !== (i === 0 ? 'session_initialized' : 'provider_invoked')) fail('manual_qa_ledger_invalid');
        previousHash = digest;
      }
      if (!entries.length || entries.length - 1 > LIMIT) fail('manual_qa_ledger_invalid');
      return entries;
    } catch (error) { if (error instanceof ManualQaError) throw error; fail('manual_qa_ledger_invalid'); }
  }
  function event(type, data = {}) {
    const fd = fs.openSync(tracePath, 'a', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify({ time: new Date(now()).toISOString(), session_id: frozen.session_id, type, ...data }) + '\n'); }
    finally { fs.closeSync(fd); }
  }
  function approvalState() {
    unchanged();
    if (!fs.existsSync(approvalPath)) return { code: 'manual_qa_awaiting_approval', approval: null };
    let value;
    try { value = JSON.parse(fs.readFileSync(approvalPath)); } catch { return { code: 'manual_qa_invalid_approval', approval: null }; }
    const issued = Date.parse(value.issued_at), expires = Date.parse(value.expires_at);
    if (value.session_id !== frozen.session_id || value.session_sha256 !== hash || value.environment_sha256 !== environmentHash
      || value.model !== frozen.model || value.user_id !== frozen.user_id || value.course_id !== frozen.course_id
      || value.max_calls !== LIMIT || !Number.isFinite(issued) || !Number.isFinite(expires)
      || issued > now() || expires <= issued || expires - issued !== DURATION) return { code: 'manual_qa_invalid_approval', approval: null };
    if (value.approved !== true) return { code: 'manual_qa_closed', approval: null };
    if (expires <= now()) return { code: 'manual_qa_expired', approval: null };
    return { code: 'active', approval: value };
  }
  function count() { return ledger().length - 1; }
  function status() {
    const used = count(), state = approvalState();
    return { sessionId: frozen.session_id, sessionSHA256: hash, approvalStatus: state.code === 'active' && used >= LIMIT ? 'manual_qa_budget_exhausted' : state.code,
      approved: Boolean(state.approval) && used < LIMIT, providerAttempts: used, maximumProviderAttempts: LIMIT,
      remainingProviderAttempts: LIMIT - used, expiresAt: state.approval?.expires_at || null,
      durationMinutes: 30, model: frozen.model, userId: frozen.user_id, courseId: frozen.course_id };
  }
  function assertRequest(req, environment, requestPath) {
    unchanged();
    if (!same(environment, frozen.environment) || !frozen.allowed_paths.includes(requestPath) || req.method !== 'POST'
      || !['127.0.0.1:3129', 'localhost:3129', '[::1]:3129'].includes(req.headers?.host)
      || !loopback(req.socket?.remoteAddress) || !loopback(req.socket?.localAddress)) fail('manual_qa_environment_mismatch');
    if (String(req.compatAuth?.userId || '') !== frozen.user_id) fail('manual_qa_scope_denied');
    const selectors = [req.body?.courseId, req.body?.activeCourseId, req.body?.active_course_id].filter(Boolean);
    if (!selectors.length || selectors.some(id => String(id) !== frozen.course_id)) fail('manual_qa_scope_denied');
  }
  function authorize(expectedHash) {
    unchanged();
    if (expectedHash !== hash || fs.existsSync(approvalPath) || count() !== 0) fail('manual_qa_invalid_approval');
    const issued = now();
    const value = { approved: true, approval_id: require('node:crypto').randomUUID(), session_id: frozen.session_id,
      session_sha256: hash, environment_sha256: environmentHash, model: frozen.model,
      user_id: frozen.user_id, course_id: frozen.course_id, max_calls: LIMIT,
      issued_at: new Date(issued).toISOString(), expires_at: new Date(issued + DURATION).toISOString() };
    const fd = fs.openSync(approvalPath, 'wx', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    return value;
  }
  function close() {
    const value = JSON.parse(fs.readFileSync(approvalPath));
    const temporary = approvalPath + '.closing';
    fs.writeFileSync(temporary, JSON.stringify({ ...value, approved: false, closed_at: new Date(now()).toISOString(), attempts_used: count() }, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, approvalPath);
  }
  function consume(payload, context) {
    assertRequest(context?.req || {}, context?.environment, context?.path);
    if (payload.model !== frozen.model) fail('manual_qa_model_mismatch');
    if (context?.knowledge?.activeCourse?.id !== frozen.course_id || !context?.knowledge?.materialsAvailable) fail('manual_qa_scope_denied');
    if (!Number.isInteger(payload.max_tokens) || payload.max_tokens <= 0 || payload.max_tokens > 900
      || JSON.stringify(payload).length > 120000 || payload.messages?.[0]?.role !== 'system') fail('manual_qa_invalid_payload');
    let lock;
    try { lock = fs.openSync(lockPath, 'wx', 0o600); }
    catch { fail('manual_qa_accounting_busy'); }
    try {
      const state = approvalState();
      if (!state.approval) fail(state.code);
      const entries = ledger();
      if (entries.length - 1 >= LIMIT) fail('manual_qa_budget_exhausted');
      const record = { type: 'provider_invoked', sequence: entries.length, session_id: frozen.session_id,
        session_sha256: hash, previous_hash: entries.at(-1).digest, time: new Date(now()).toISOString(),
        approval_id: state.approval.approval_id, model: frozen.model, request_id: context.requestId,
        conversation_id: String(context.req.body?.conversationId || context.req.body?.conversation_id || '') };
      const entry = { ...record, digest: sha(JSON.stringify(record)) };
      const fd = fs.openSync(ledgerPath, 'a', 0o600);
      try { fs.writeFileSync(fd, JSON.stringify(entry) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      // Debit is durable before ANY outgoing generation, retry or repair.
      event('provider_invoked', entry);
      return entry.sequence;
    } catch (error) {
      if (error instanceof ManualQaError) throw error;
      fail('manual_qa_ledger_invalid');
    } finally { fs.closeSync(lock); fs.unlinkSync(lockPath); }
  }
  ledger(); // Missing, truncated, or altered accounting never becomes zero.
  return { frozen, hash, configured, ledgerPath, tracePath, approvalPath, count, status, approvalState, assertRequest, authorize, close, consume, event };
}
module.exports = { createGate, ManualQaError, LOCAL, LIMIT, DURATION, providerConfig, backendRoot, backendRequire, sha };
