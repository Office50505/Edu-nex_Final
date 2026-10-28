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
    providerAttempts: gate.count(), maximumProviderAttempts: 4, priorLedgersPreserved: true,
    remainingBlocker: gate.approval() ? null : 'Explicit approval required before sending either frozen question.' };
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
    user_id: gate.frozen.user_id, conversation_id: gate.frozen.conversation_id, max_calls: 4,
    issued_at: new Date(now).toISOString(), expires_at: new Date(now + 30 * 60_000).toISOString() };
  writeJson('provider_approval.json', value, true);
  console.log(JSON.stringify({ approved: true, model: value.model, conversationId: value.conversation_id,
    maxProviderAttempts: 4, expiresAt: value.expires_at, paidCallsExecutedByCommand: 0,
    next: 'Send Turn 1 and Turn 2 through the already-open iOS simulator; do not start a new chat.' }, null, 2));
}
function review() {
  previousLedgersUnchanged();
  const events = fs.readFileSync(gate.tracePath, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  const app = inspectApp();
  const turns = gate.frozen.turns.map(turn => events.find(e => e.type === 'chat_response' && e.turn === turn.number
    && e.conversation_id === gate.frozen.conversation_id && e.user_id === gate.frozen.user_id));
  const allLive = turns.every((turn, i) => turn?.httpStatus === 200 && turn.response?.provider === 'fal-openrouter'
    && turn.response?.outcome?.liveModelAnswer === true
    && events.some(e => e.type === 'provider_invoked' && e.turn === i + 1)
    && events.some(e => e.type === 'provider_response' && e.request_id === turn.request_id && e.status === 200));
  const appMatches = app.conversationId === gate.frozen.conversation_id && turns.every((turn, i) => turn
    && app.messages.some(m => m.role === 'user' && m.content === gate.frozen.turns[i].query)
    && app.messages.some(m => m.role === 'assistant' && !m.failed && m.content === turn.response?.answer?.slice(0, 4000)));
  const historyExact = Boolean(turns[1] && gate.completedTurn(1)) && sameHistory(turns[1].request.history, gate.expectedHistory(2));
  const second = turns[1]?.response?.answer || '';
  // These are review signals, not a lexical pass/fail grader. A negated word
  // in explanatory prose does not establish an actual invented promotion.
  const signals = { correctedNamePresent: /\bchai\s+corner\b/i.test(second),
    locationPresent: /vijay\s+nagar/i.test(second) && /indore/i.test(second),
    productsPresent: /maggi/i.test(second) && /sandwich/i.test(second) && /\bchai\b/i.test(second.replace(/chai\s+corner/gi, '')),
    numericPriceOrDiscount: /₹\s*\d|\b(?:rs\.?|inr)\s*\d|\d\s*%/i.test(second),
    promotionWordsForContextualReview: second.match(/\b(?:discounts?|offers?|free|sale|best|guaranteed|number one)\b/gi) || [],
    fullAnswerWordCount: second.trim() ? second.trim().split(/\s+/).length : 0 };
  const value = { reviewedAt: new Date().toISOString(), backendUrl: base, model: gate.frozen.model,
    casesSHA256: gate.hash, conversationId: gate.frozen.conversation_id, providerAttempts: gate.count(),
    maximumProviderAttempts: 4, allTurnsGenuineProviderAnswers: allLive, nativeMessagesMatchBackend: appMatches,
    secondRequestIncludesActualFirstExchange: historyExact, turns,
    latencyMs: turns.map(t => t?.durationMs ?? null),
    providerFailures: events.filter(e => ['provider_blocked', 'provider_http_error', 'provider_transport_error', 'provider_response_unreadable'].includes(e.type)),
    reviewSignals: signals, manualReviewRequired: true,
    assessment: allLive && appMatches && historyExact ? 'REQUIRES CONTENT REVIEW' : 'LIVE ACCEPTANCE NOT PASSED',
    reviewCriteria: ['English poster prompt uses actual Chai Junction facts and real photo; no invented price or promotion.',
      'Second answer is a useful short natural Hinglish caption for Chai Corner with remembered location/products.',
      'Inspect actual claims in the caption; negated discount words in surrounding prose alone are not a promotion.'] };
  writeJson('live-result.json', value); console.log(JSON.stringify(value, null, 2));
}
async function main() {
  if (process.argv[2] === 'check') console.log(JSON.stringify(await check(), null, 2));
  else if (process.argv[2] === 'approve') await approve();
  else if (process.argv[2] === 'review') review();
  else throw Error('Usage: node control.cjs check|approve --sha256 HASH|review');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
