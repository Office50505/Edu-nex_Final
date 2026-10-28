// Isolated launcher only: uses the normal server, auth, course retriever and
// requestTutorProvider retry path. No production environment is loaded into it.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const { createGate, backendRoot, backendRequire, sha } = require('./gate.cjs');
const gate = createGate();
const secrets = JSON.parse(fs.readFileSync('/tmp/skillomate-lba-manual-retest/reliability-jwt.json', 'utf8'));
for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'JWT_SIGNUP_SECRET']) {
  if (typeof secrets[key] !== 'string' || secrets[key].length < 48) throw Error('Stable isolated JWT keys are missing');
}
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'source.sha256.json'), 'utf8'));
const repoRoot = path.resolve(backendRoot, '..');
for (const [file, hash] of Object.entries(manifest)) {
  if (sha(fs.readFileSync(path.join(repoRoot, file))) !== hash) throw Error('Acceptance source fingerprint changed: ' + file);
}
function closeApproval(reason) {
  if (!fs.existsSync(gate.approvalPath)) return;
  const value = JSON.parse(fs.readFileSync(gate.approvalPath));
  if (!value.approved) return;
  const temporary = gate.approvalPath + '.closing';
  fs.writeFileSync(temporary, JSON.stringify({ ...value, approved: false, closed_at: new Date().toISOString(), close_reason: reason, attempts_used: gate.count() }, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, gate.approvalPath);
}

if (!gate.configured.key) throw Error('Existing provider key is not configured');
for (const key of Object.keys(process.env)) {
  if (!['PATH', 'HOME', 'TMPDIR', 'LANG', 'TERM', 'TZ', 'USER', 'SHELL'].includes(key)) delete process.env[key];
}
Object.assign(process.env, {
  NODE_ENV: 'development', HOST: '127.0.0.1', PORT: '3129',
  MONGODB_URI: 'mongodb://127.0.0.1:27028/skillomate_lba_manual_retest',
  REDIS_URL: 'redis://127.0.0.1:6388/0', DISABLE_BACKGROUND_JOBS: 'true', SERVE_FRONTEND: 'false',
  SKILLOMATE_CONFIG_SOURCE: 'env', OTP_PROVIDER: 'demo',
  FAL_API_KEY: gate.configured.key, FAL_KEY: '', FAL_OPENROUTER_MODEL: gate.configured.model,
  FAL_OPENROUTER_URL: gate.configured.url,
  JWT_SECRET: secrets.JWT_SECRET, JWT_REFRESH_SECRET: secrets.JWT_REFRESH_SECRET,
  JWT_SIGNUP_SECRET: secrets.JWT_SIGNUP_SECRET,
});
backendRequire('dotenv').config = () => ({ parsed: {} });
const requestContext = new AsyncLocalStorage();
const transportContext = new AsyncLocalStorage();
const loopback = host => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
const net = require('node:net');
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const values = Array.isArray(args[0]) ? args[0] : args;
  const first = values[0];
  const host = typeof first === 'object' ? first.host || first.hostname || 'localhost'
    : typeof values[1] === 'string' ? values[1] : 'localhost';
  if (!loopback(host) && !(host === 'fal.run' && transportContext.getStore()?.accounted)) throw Error('Unaccounted external network blocked');
  return originalConnect.apply(this, args);
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const target = new URL(String(url));
  if (loopback(target.hostname)) return originalFetch(url, { ...options, redirect: 'error' });
  if (target.href !== gate.configured.url || options.method !== 'POST') throw Error('External endpoint blocked');
  const payload = JSON.parse(options.body || '{}');
  const context = requestContext.getStore();
  const knowledge = context?.knowledge;
  const scope = { activeCourse: knowledge?.activeCourse ? { _id: knowledge.activeCourse.id, slug: knowledge.activeCourse.slug } : null,
    includeMaterials: Boolean(knowledge?.materialsAvailable) };
  for (const message of payload.messages || []) backendRequire('./services/tutorKnowledge').assertCourseTextScope(message.content, scope);
  gate.event('provider_payload', { payload, scope });
  const attempt = gate.consume(payload, context);
  const started = Date.now();
  try {
    const response = await transportContext.run({ accounted: true }, () => originalFetch(url, { ...options, redirect: 'error' }));
    if (response.ok) {
      try { gate.event('provider_response', { request_id: context?.requestId, durationMs: Date.now() - started, call: attempt, status: response.status, data: await response.clone().json() }); }
      catch { gate.event('provider_response_unreadable', { request_id: context?.requestId, durationMs: Date.now() - started, call: attempt, status: response.status }); }
    } else gate.event('provider_http_error', { request_id: context?.requestId, durationMs: Date.now() - started, call: attempt, status: response.status });
    return response;
  } catch (error) { gate.event('provider_transport_error', { request_id: context?.requestId, durationMs: Date.now() - started, call: attempt, name: error.name }); throw error; }
};
const service = backendRequire('./services/aiTutorService');
const originalContext = service.buildContext;
service.buildContext = async (...args) => {
  const knowledge = await originalContext(...args);
  const state = requestContext.getStore();
  if (state) state.knowledge = knowledge;
  if (state?.path === '/api/ai/chat') gate.event('context', { request_id: state.requestId, authenticated_user_id: String(state.req.compatAuth?.userId || ''), conversation_id: state.req.body?.conversationId,
    activeCourseId: knowledge.activeCourse?.id, materialsAvailable: knowledge.materialsAvailable,
    retrievedChunkIds: knowledge.debugChunks?.map(chunk => chunk.chunkId) });
  return knowledge;
};
const fingerprints = manifest;
const classifierHash = sha(service.classifyBillingIntent.toString());
const http = require('node:http');
const originalEmit = http.Server.prototype.emit;
http.Server.prototype.emit = function (event, ...args) {
  if (event !== 'request') return originalEmit.call(this, event, ...args);
  const [req, res] = args;
  const pathname = req.url.split('?')[0];
  if (req.method === 'GET' && ['/__native_acceptance/status', '/__local_retest/status'].includes(pathname)) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ profile: gate.frozen.suite, pid: process.pid, backendUrl: 'http://127.0.0.1:3129',
      database: process.env.MONGODB_URI, stableLocalSessionKeys: true, approvalRequired: true, conversationId: gate.frozen.conversation_id, productionConfigLoaded: false, backgroundJobsEnabled: false,
      model: gate.frozen.model, providerKeyConfigured: Boolean(gate.configured.key),
      approved: Boolean(gate.approval()), providerAttempts: gate.count(), maxProviderAttempts: gate.frozen.max_provider_attempts,
      casesSHA256: gate.hash, courseId: gate.frozen.course_id, classifierHash, sources: fingerprints }));
    return true;
  }
  const started = Date.now();
  const requestId = crypto.randomUUID();
  const end = res.end;
  res.end = function (chunk, ...rest) {
    if (pathname === '/api/ai/chat') {
      let response; try { response = JSON.parse(String(chunk)); } catch {}
      const turn = gate.frozen.turns.find(item => item.query === req.body?.message)?.number;
      gate.event('chat_response', { request_id: requestId, durationMs: Date.now() - started, conversation_id: req.body?.conversationId, httpStatus: res.statusCode,
        turn, user_id: String(req.compatAuth?.userId || ''),
        request: { message: req.body?.message, activeCourseId: req.body?.activeCourseId, history: req.body?.history, conversationId: req.body?.conversationId }, response });
      if (turn && req.body?.conversationId === gate.frozen.conversation_id) {
        const live = res.statusCode === 200 && response?.provider === 'fal-openrouter' && response?.outcome?.liveModelAnswer === true;
        if (!live || turn === gate.frozen.turns.length) closeApproval(live ? 'frozen_native_test_completed' : 'native_turn_failed');
      }
    }
    return end.call(this, chunk, ...rest);
  };
  return requestContext.run({ req, path: pathname, requestId }, () => originalEmit.call(this, event, ...args));
};
backendRequire('./server');
