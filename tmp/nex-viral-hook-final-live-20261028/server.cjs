// Isolated launcher only: uses the normal server, auth, course retriever and
// requestTutorProvider retry path. No production environment is loaded into it.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const { createGate, backendRoot, backendRequire, sha } = require('./gate.cjs');
if (process.env.NODE_ENV === 'production') throw Error('Manual QA launcher refuses production mode');
const gate = createGate();
const secrets = JSON.parse(fs.readFileSync(path.join(__dirname, '../nex-cartoon-safety-live-20261028/.runtime/jwt-secrets.json'), 'utf8'));
for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'JWT_SIGNUP_SECRET']) {
  if (typeof secrets[key] !== 'string' || secrets[key].length < 48) throw Error('Stable isolated JWT keys are missing');
}
const repoRoot = path.resolve(backendRoot, '..');
const sourceFiles = JSON.parse(fs.readFileSync(path.join(__dirname, 'source-files.json'), 'utf8'));
const fingerprints = Object.fromEntries(sourceFiles.map(file => [file, sha(fs.readFileSync(path.join(repoRoot, file)))]));
const revision = JSON.parse(fs.readFileSync(path.join(__dirname, 'source-revision.json')));
if (JSON.stringify(fingerprints) !== JSON.stringify(revision.sources)) throw Error('Frozen source revision differs from startup files');
gate.approvalState(); // Verify session and every frozen source before listening.

if (!gate.configured.key) throw Error('Existing provider key is not configured');
for (const key of Object.keys(process.env)) {
  if (!['PATH', 'HOME', 'TMPDIR', 'LANG', 'TERM', 'TZ', 'USER', 'SHELL'].includes(key)) delete process.env[key];
}
Object.assign(process.env, {
  NODE_ENV: 'development', HOST: '127.0.0.1', PORT: '3129',
  MONGODB_URI: 'mongodb://127.0.0.1:27028/skillomate_lba_final_qa_20261027',
  REDIS_URL: 'redis://127.0.0.1:6388/1', DISABLE_BACKGROUND_JOBS: 'true', SERVE_FRONTEND: 'false',
  SKILLOMATE_CONFIG_SOURCE: 'env', OTP_PROVIDER: 'demo',
  FAL_API_KEY: gate.configured.key, FAL_KEY: '', FAL_OPENROUTER_MODEL: gate.configured.model,
  FAL_OPENROUTER_URL: gate.configured.url,
  JWT_SECRET: secrets.JWT_SECRET, JWT_REFRESH_SECRET: secrets.JWT_REFRESH_SECRET,
  JWT_SIGNUP_SECRET: secrets.JWT_SIGNUP_SECRET,
});
backendRequire('dotenv').config = () => ({ parsed: {} });
const environment = { nodeEnv: process.env.NODE_ENV, backendUrl: 'http://127.0.0.1:3129', host: process.env.HOST,
  port: Number(process.env.PORT), database: process.env.MONGODB_URI, redis: process.env.REDIS_URL,
  workspaceRoot: repoRoot, productionConfigLoaded: false, backgroundJobsEnabled: process.env.DISABLE_BACKGROUND_JOBS !== 'true' };
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
  const phase = /Correct only these unsupported factual propositions|Repair only the listed answer issues|Repair the previous response/u.test(payload.messages?.[0]?.content || '') ? 'repair' : 'generation';
  gate.event('provider_payload', { phase, request_id: context?.requestId, conversation_id: context?.req.body?.conversationId, payload, scope });
  let attempt;
  try { attempt = gate.consume(payload, context); }
  catch (error) { gate.event('provider_blocked', { reason: error.code || 'manual_qa_invalid_session', request_id: context?.requestId,
    conversation_id: context?.req.body?.conversationId }); throw error; }
  const started = Date.now();
  try {
    const response = await transportContext.run({ accounted: true }, () => originalFetch(url, { ...options, redirect: 'error' }));
    if (response.ok) {
      try { gate.event('provider_response', { phase, request_id: context?.requestId, durationMs: Date.now() - started, call: attempt, status: response.status, data: await response.clone().json() }); }
      catch { gate.event('provider_response_unreadable', { request_id: context?.requestId, durationMs: Date.now() - started, call: attempt, status: response.status }); }
    } else gate.event('provider_http_error', { request_id: context?.requestId, durationMs: Date.now() - started, call: attempt, status: response.status });
    return response;
  } catch (error) { gate.event('provider_transport_error', { request_id: context?.requestId, durationMs: Date.now() - started, call: attempt, name: error.name }); throw error; }
};
const availability = backendRequire('./services/tutorAvailability');
const originalUnavailable = availability.tutorUnavailable;
availability.tutorUnavailable = (status, message) => require('./availability.cjs').qaUnavailable(originalUnavailable, status, message);
require('../nex-cartoon-safety-live-20261028/binding.cjs').bindCartoon();
const service = backendRequire('./services/aiTutorService');
const pipeline = require('./pipeline-check.cjs').verifyPipeline(service, backendRequire, gate.frozen, sha);
const originalContext = service.buildContext;
service.buildContext = async (...args) => {
  const knowledge = await originalContext(...args);
  const state = requestContext.getStore();
  if (state) state.knowledge = knowledge;
  if (gate.frozen.allowed_paths.includes(state?.path)) gate.event('context', { request_id: state.requestId, authenticated_user_id: String(state.req.compatAuth?.userId || ''), conversation_id: state.req.body?.conversationId,
    activeCourseId: knowledge.activeCourse?.id, materialsAvailable: knowledge.materialsAvailable,
    retrievedChunkIds: knowledge.debugChunks?.map(chunk => chunk.chunkId), requestContract: knowledge.responseContract });
  return knowledge;
};
const originalAssessment = service.assessTaskResponse;
service.assessTaskResponse = (...args) => {
  const assessment = originalAssessment(...args);
  const state = requestContext.getStore();
  if (state && gate.frozen.allowed_paths.includes(state.path)) gate.event('task_assessment', {
    request_id: state.requestId, conversation_id: state.req.body?.conversationId,
    assessment: { task: assessment.task, needsRepair: assessment.needsRepair, issues: assessment.issues, edits: assessment.edits, answer: assessment.answer } });
  return assessment;
};
// The normal authentication and rate-limit layers stay in place. Only this
// development process wraps the final handler; production never imports it.

const K = backendRequire('./services/tutorKnowledge');
const originalPackValidation = service.validatePackReply;
service.validatePackReply = (...args) => {
  const validation = originalPackValidation(...args);
  const state = requestContext.getStore();
  if (state && gate.frozen.allowed_paths.includes(state.path)) gate.event('pack_validation', {
    request_id: state.requestId, conversation_id: state.req.body?.conversationId,
    assessment: { issue: validation.issue, answer: validation.reply, issues: validation.assessment?.issues || [], edits: validation.assessment?.edits || [], repairRequested: Boolean(validation.repairRequest), repairKind: validation.repairRequest?.kind || null } });
  return validation;
};
const apiRouter = backendRequire('./routes/ai');
require('./knowledge-check.cjs').install(apiRouter, service, backendRequire, gate);
const originalHandler = apiRouter.handleTutorChat;
if (!/responseContract/.test(originalHandler.toString()) || !/assessTaskResponse/.test(originalHandler.toString())) throw Error('Expected shared task pipeline route is missing');
pipeline.routeTaskPipelineLoaded = true;
pipeline.groundingRepairLoaded = /repairRequest\?\.kind === 'grounding'/u.test(originalHandler.toString());
if (!pipeline.groundingRepairLoaded) throw Error('Grounding repair route is not loaded');
const { guardHandler } = require('./guard.cjs');
const guardedHandler = guardHandler(gate, environment, () => requestContext.getStore()?.path, originalHandler,
  backendRequire('./services/tutorAvailability').tutorUnavailable);
const layer = apiRouter.stack.find(item => item.route?.path === '/chat');
const finalHandler = layer?.route.stack.find(item => item.handle === originalHandler);
if (!finalHandler || layer.route.stack.length < 3) throw Error('Expected normal auth and rate limiting before QA guard');
finalHandler.handle = guardedHandler;
apiRouter.handleTutorChat = guardedHandler; // Legacy mobile route retains its normal auth.
const classifierHash = sha(service.classifyBillingIntent.toString());
const http = require('node:http');
const originalEmit = http.Server.prototype.emit;
http.Server.prototype.emit = function (event, ...args) {
  if (event !== 'request') return originalEmit.call(this, event, ...args);
  const [req, res] = args;
  const pathname = req.url.split('?')[0];
  if (req.method === 'GET' && ['/__manual_qa/status', '/__local_retest/status'].includes(pathname)) {
    let status;
    try { status = gate.status(); }
    catch (error) {
      res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ profile: gate.frozen.suite, approved: false, code: error.code || 'manual_qa_ledger_invalid' }));
      return true;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ profile: gate.frozen.suite, pid: process.pid, ...status,
      backendUrl: environment.backendUrl, database: environment.database, environment,
      productionConfigLoaded: false, stableLocalSessionKeys: true, approvalRequired: true,
      providerKeyConfigured: Boolean(gate.configured.key), pipeline, classifierHash, sources: fingerprints, sourceRevisionSHA256: gate.frozen.source_revision_sha256, protections: { normalAuthentication: true, normalRateLimiting: true, billingClassifier: typeof service.classifyBillingIntent === 'function', viralHookDomainPolicy: pipeline.domain === 'viral-hook-formula', courseIsolation: typeof backendRequire('./services/tutorKnowledge').assertCourseTextScope === 'function', durableAttemptAccounting: true } }));
    return true;
  }
  const started = Date.now();
  const requestId = crypto.randomUUID();
  const end = res.end;
  res.end = function (chunk, ...rest) {
    if (gate.frozen.allowed_paths.includes(pathname)) {
      let response; try { response = JSON.parse(String(chunk)); } catch {}
      gate.event('chat_response', { request_id: requestId, durationMs: Date.now() - started, conversation_id: req.body?.conversationId, httpStatus: res.statusCode,
        user_id: String(req.compatAuth?.userId || ''),
        request: { message: req.body?.message, activeCourseId: req.body?.activeCourseId, history: req.body?.history, conversationId: req.body?.conversationId }, response });

    }
    return end.call(this, chunk, ...rest);
  };
  return requestContext.run({ req, path: pathname, requestId, environment }, () => originalEmit.call(this, event, ...args));
};
backendRequire('./server');
