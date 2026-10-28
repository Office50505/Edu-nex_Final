const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createGate, backendRoot, sha } = require('./gate.cjs');
const gate = createGate();
const base = gate.frozen.environment.backendUrl;
async function running() {
  const response = await fetch(base + '/__manual_qa/status', { redirect: 'error', signal: AbortSignal.timeout(5000) });
  const value = await response.json();
  if (response.status !== 200 || value.profile !== gate.frozen.suite || value.sessionSHA256 !== gate.hash
    || value.productionConfigLoaded !== false || value.database !== gate.frozen.environment.database
    || value.model !== gate.frozen.model || !value.providerKeyConfigured || value.sourceRevisionSHA256 !== gate.frozen.source_revision_sha256
    || !value.pipeline?.requestContractLoaded || !value.pipeline?.taskPreservingValidationLoaded || !value.pipeline?.routeTaskPipelineLoaded
    || !value.pipeline?.deterministicStartupCheckPassed) throw Error('Expected isolated manual QA backend and shared pipeline are not ready');
  for (const [file, hash] of Object.entries(value.sources)) {
    if (sha(fs.readFileSync(path.resolve(backendRoot, '..', file))) !== hash) throw Error('Restart the manual QA backend to load current source: ' + file);
  }
  return value;
}
function previousUnchanged() {
  const previous = JSON.parse(fs.readFileSync(path.join(__dirname, 'previous-ledgers.sha256.json')));
  for (const [file, hash] of Object.entries(previous)) if (sha(fs.readFileSync(path.resolve(backendRoot, '..', file))) !== hash) throw Error('Previous saved test artifact changed: ' + file);
}
async function check() {
  const server = await running();
  const ready = await fetch(base + '/api/ready', { redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (ready.status !== 200) throw Error('Local backend/database readiness failed');
  const output = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'app-evaluate.cjs'), path.join(__dirname, 'app-inspect.js')], { encoding: 'utf8', timeout: 20000 }));
  if (!output.ok) throw Error(output.error);
  const app = output.value;
  if (app.backendUrl !== base || !app.authenticated || app.entitlementState !== 'ACTIVE' || !app.courseIndexed
    || app.userId !== gate.frozen.user_id || app.activeCourseId !== gate.frozen.course_id || app.sourceRevisionSHA256 !== gate.frozen.source_revision_sha256
    || !app.pipeline?.taskPreservingValidationLoaded || !app.history.preservedConversations.length) throw Error('Open the authorized synthetic account and AI Local Business Ads in the local simulator');
  previousUnchanged();
  const value = { checkedAt: new Date().toISOString(), backendReady: true, isolatedDatabaseReady: true,
    updatedCodeLoaded: true, simulatorAuthenticated: true, simulatorCourseEntitled: true,
    sourceRevisionSHA256: server.sourceRevisionSHA256, protections: server.protections, history: app.history, backendUrl: base, currentConversationId: app.conversationId, arbitraryQuestionsAndConversationsAllowed: true,
    previousLedgersPreserved: true, providerKeyConfigured: server.providerKeyConfigured, pipeline: server.pipeline,
    entitlementSource: app.entitlementSource, ...gate.status(),
    blocker: gate.status().approved ? null : gate.status().approvalStatus };
  fs.writeFileSync(path.join(__dirname, 'readiness.json'), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  return value;
}
async function main() {
  if (process.argv[2] === 'check') console.log(JSON.stringify(await check(), null, 2));
  else if (process.argv[2] === 'status') {
    previousUnchanged(); const server = await running();
    console.log(JSON.stringify({ backendUrl: base, profile: server.profile, pid: server.pid, ...gate.status() }, null, 2));
  }
  else if (process.argv[2] === 'approve') {
    if (process.argv[3] !== '--sha256' || process.argv[4] !== gate.hash) throw Error('Provide --sha256 with the exact frozen session descriptor hash');
    await check();
    const value = gate.authorize(process.argv[4]);
    console.log(JSON.stringify({ sessionAuthorized: true, model: value.model, maximumProviderAttempts: 8,
      expiresAt: value.expires_at, ...gate.status(), paidCallsExecutedByCommand: 0 }, null, 2));
  } else if (process.argv[2] === 'close') { gate.close(); console.log(JSON.stringify(gate.status(), null, 2)); }
  else throw Error('Usage: node control.cjs check|status|approve --sha256 SESSION_HASH|close');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
