const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { createGate, sha, backendRoot, sameHistory } = require('./gate.cjs');
const base = 'http://127.0.0.1:3129';
const gate = createGate();
function writeJson(name, value, exclusive = false) {
  fs.writeFileSync(path.join(__dirname, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: exclusive ? 'wx' : 'w' });
}
function inspectApp() {
  const result = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'app-evaluate.cjs'), path.join(__dirname, 'app-inspect.js')], { encoding: 'utf8', timeout: 20000 }));
  if (!result.ok) throw Error(result.error || 'Simulator inspection failed');
  return result.value;
}
function previousLedgersUnchanged() {
  const previous = JSON.parse(fs.readFileSync(path.join(__dirname, 'previous-ledgers.sha256.json')));
  for (const [file, hash] of Object.entries(previous)) {
    if (sha(fs.readFileSync(path.resolve(backendRoot, '..', file))) !== hash) throw Error('Previous ledger/result changed: ' + file);
  }
}
async function check({ requireFresh = false } = {}) {
  const response = await fetch(base + '/__native_acceptance/status', { redirect: 'error', signal: AbortSignal.timeout(5000) });
  const server = await response.json();
  if (response.status !== 200 || server.profile !== gate.frozen.suite || server.casesSHA256 !== gate.hash
    || server.productionConfigLoaded !== false || server.database !== 'mongodb://127.0.0.1:27028/skillomate_lba_manual_retest'
    || server.conversationId !== gate.frozen.conversation_id || !server.providerKeyConfigured || !server.stableLocalSessionKeys) throw Error('Expected isolated simulator acceptance backend is not ready');
  const ready = await fetch(base + '/api/ready', { redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (ready.status !== 200) throw Error('Isolated backend/database readiness failed');
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'source.sha256.json')));
  if (JSON.stringify(manifest) !== JSON.stringify(server.sources)) throw Error('Serving source manifest differs');
  for (const [file, hash] of Object.entries(manifest)) {
    if (sha(fs.readFileSync(path.resolve(backendRoot, '..', file))) !== hash) throw Error('Serving source changed: ' + file);
  }
  const app = inspectApp();
  if (app.backendUrl !== base || !app.authenticated || !app.courseIndexed || app.entitlementState !== 'ACTIVE'
    || app.userId !== gate.frozen.user_id || app.activeCourseId !== gate.frozen.course_id
    || app.conversationId !== gate.frozen.conversation_id) throw Error('Simulator account/course/conversation differs from frozen acceptance case');
  if (requireFresh && !sameHistory(app.messages, gate.frozen.initial_history)) throw Error('Expected a fresh native chat with only its frozen greeting. Prepare a new case if this chat was used.');
  previousLedgersUnchanged();
  const value = { checkedAt: new Date().toISOString(), backendUrl: base, simulator: app,
    backendReady: true, isolatedDatabaseReady: true, updatedCodeLoaded: true, providerKeyConfigured: Boolean(gate.configured.key),
    model: gate.frozen.model, casesSHA256: gate.hash, approved: Boolean(gate.approval()),
    providerAttempts: gate.count(), maximumProviderAttempts: 2, priorLedgersPreserved: true,
    remainingBlocker: gate.approval() ? null : 'Explicit approval required before sending the frozen question.' };
  writeJson('readiness.json', value);
  return value;
}
async function approve() {
  if (process.argv[3] !== '--sha256' || process.argv[4] !== gate.hash) throw Error('Supply --sha256 with this exact frozen case hash');
  if (fs.existsSync(gate.approvalPath) || gate.count()) throw Error('This approval cannot be renewed or its ledger reset. Prepare a new bounded case.');
  await check({ requireFresh: true });
  const now = Date.now();
  const value = { approved: true, approval_id: crypto.randomUUID(), model: gate.frozen.model,
    cases_sha256: gate.hash, turns_sha256: sha(JSON.stringify(gate.frozen.turns)), course_id: gate.frozen.course_id,
    user_id: gate.frozen.user_id, conversation_id: gate.frozen.conversation_id, max_calls: 2,
    issued_at: new Date(now).toISOString(), expires_at: new Date(now + 30 * 60_000).toISOString() };
  writeJson('provider_approval.json', value, true);
  console.log(JSON.stringify({ approved: true, model: value.model, conversationId: value.conversation_id,
    maxProviderAttempts: 2, expiresAt: value.expires_at, paidCallsExecutedByCommand: 0,
    next: 'Send the one frozen question through the already-open iOS simulator; do not start a new chat.' }, null, 2));
}
function review() {
  previousLedgersUnchanged();
  const events = fs.readFileSync(gate.tracePath, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  const app = inspectApp();
  const turn = events.find(e => e.type === 'chat_response' && e.turn === 1
    && e.conversation_id === gate.frozen.conversation_id && e.user_id === gate.frozen.user_id);
  const paidAttempts = events.filter(e => e.type === 'provider_invoked' && e.turn === 1);
  const providerReply = events.find(e => e.type === 'provider_response' && e.request_id === turn?.request_id && e.status === 200);
  const context = events.find(e => e.type === 'context' && e.request_id === turn?.request_id);
  const live = Boolean(turn?.httpStatus === 200 && turn.response?.provider === 'fal-openrouter'
    && turn.response?.outcome?.liveModelAnswer === true && paidAttempts.length && providerReply);
  const appMatches = Boolean(turn && app.conversationId === gate.frozen.conversation_id
    && app.messages.some(m => m.role === 'user' && m.content === gate.frozen.turns[0].query)
    && app.messages.some(m => m.role === 'assistant' && !m.failed && m.content === turn.response?.answer?.slice(0, 4000)));
  const scopeMatches = context?.activeCourseId === gate.frozen.course_id && context?.materialsAvailable === true
    && context?.authenticated_user_id === gate.frozen.user_id;
  const historyMatches = Boolean(turn && sameHistory(turn.request.history, gate.frozen.initial_history));
  const answer = turn?.response?.answer || '';
  const blocks = [...answer.matchAll(/```[^\n]*\n([\s\S]*?)```/g)];
  const prompt = blocks.length ? blocks.map(m => m[1]).join('\n\n').trim() : answer.trim();
  const { businessCreativeRequest, creativeReplyMismatch } = require('../../edunex-b/services/businessCreativeRequest');
  const intent = businessCreativeRequest(gate.frozen.turns[0].query);
  const signals = {
    shopName: /\bchai\s+junction\b/i.test(prompt),
    location: /vijay\s+nagar/i.test(prompt) && /indore/i.test(prompt),
    chai: /\b(?:chai|tea)\b/i.test(prompt.replace(/chai\s+junction/gi, '')),
    maggi: /\bmaggi\b/i.test(prompt), sandwiches: /\bsandwich(?:es)?\b/i.test(prompt),
    realPhoto: /\b(?:real|actual|supplied|provided|uploaded|reference)\b[^.!?\n]{0,60}\b(?:photo|image)\b/i.test(prompt),
    signboard: /signboard|signage|shop sign|shop identity/i.test(prompt),
    unrequestedCreativePurpose: creativeReplyMismatch(prompt, intent),
    numericPriceOrDiscount: /₹\s*\d|\b(?:rs\.?|inr)\s*\d|\d\s*%/i.test(prompt),
    pricePlaceholder: /\[\s*price\s*\]/i.test(prompt),
    billingOrCourseSummary: /phonepe|razorpay|skillomate subscription|course overview|\blesson\s+\d+/i.test(answer),
    wordsForContextualReview: prompt.match(/\b(?:festival|festive|diwali|eid|discounts?|offers?|free|sale|best|fresh|guaranteed|number one)\b/gi) || [],
    wordCount: prompt ? prompt.split(/\s+/).length : 0,
  };
  const value = { reviewedAt: new Date().toISOString(), backendUrl: base, model: gate.frozen.model,
    casesSHA256: gate.hash, conversationId: gate.frozen.conversation_id,
    providerAttempts: gate.count(), maximumProviderAttempts: 2,
    genuineProviderAnswer: live, nativeAnswerMatchesBackend: appMatches, authorizedCourseScopeMatches: scopeMatches,
    frozenInitialHistoryMatches: historyMatches, actualAnswer: answer, extractedPosterPrompt: prompt,
    latencyMs: turn?.durationMs ?? null,
    providerLatencyMs: events.filter(e => e.type === 'provider_response').map(e => e.durationMs),
    providerFailures: events.filter(e => ['provider_blocked','provider_http_error','provider_transport_error','provider_response_unreadable'].includes(e.type)),
    reviewSignals: signals, manualReviewRequired: true,
    assessment: live && appMatches && scopeMatches && historyMatches ? 'REQUIRES CONTENT REVIEW' : 'LIVE VERIFICATION NOT PASSED',
    reviewCriteria: ['Direct, usable English general Instagram poster prompt.',
      'Actual Chai Junction identity, Vijay Nagar/Indore, chai, Maggi and sandwiches retained; real shop photo and signboard preserved.',
      'No unrequested festival theme, discount, offer, price or unsupported product/promotional claim.',
      'No billing answer, course summary or fallback replacement. Inspect actual claims; negated words alone are not a violation.'] };
  writeJson('live-result.json', value); console.log(JSON.stringify(value, null, 2));
}
async function main() {
  if (process.argv[2] === 'check') console.log(JSON.stringify(await check(), null, 2));
  else if (process.argv[2] === 'approve') await approve();
  else if (process.argv[2] === 'review') review();
  else throw Error('Usage: node control.cjs check|approve --sha256 HASH|review');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
