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
  const preflight = JSON.parse(fs.readFileSync(path.join(__dirname, 'preflight-provider-payload.json')));
  if (!preflight.offline || !preflight.guidanceConfirmed || preflight.questionSHA256 !== gate.frozen.question_sha256
    || preflight.sourceManifestSHA256 !== sha(fs.readFileSync(path.join(__dirname, 'source.sha256.json')))) throw Error('Offline provider-bound guidance verification is missing or stale');
  const value = { checkedAt: new Date().toISOString(), backendUrl: base, simulator: app,
    backendReady: true, isolatedDatabaseReady: true, updatedCodeLoaded: true, customizationGuidanceVerifiedOffline: true, questionSHA256: gate.frozen.question_sha256, providerKeyConfigured: Boolean(gate.configured.key),
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
    user_id: gate.frozen.user_id, conversation_id: gate.frozen.conversation_id, question_sha256: gate.frozen.question_sha256, max_calls: 2,
    issued_at: new Date(now).toISOString(), expires_at: new Date(now + 30 * 60_000).toISOString() };
  writeJson('provider_approval.json', value, true);
  console.log(JSON.stringify({ approved: true, model: value.model, conversationId: value.conversation_id,
    maxProviderAttempts: 2, expiresAt: value.expires_at, paidCallsExecutedByCommand: 0,
    next: 'Send the one frozen question through the already-open iOS simulator; do not start a new chat.' }, null, 2));
}
async function main() {
  if (process.argv[2] === 'check') console.log(JSON.stringify(await check(), null, 2));
  else if (process.argv[2] === 'approve') await approve();
  else throw Error('Usage: node control.cjs check|approve --sha256 HASH');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
