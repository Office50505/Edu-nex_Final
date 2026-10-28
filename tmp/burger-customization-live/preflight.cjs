// Offline request/transport assembly only. The existing fixture injects a local
// fetch stub; this never uses a provider key, socket or a live approval ledger.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createGate, sha } = require('./gate.cjs');
const { backend } = require('../../edunex-b/tests/ai-tutor-fixture.cjs');
const { course } = require('../../edunex-b/scripts/eval/local-business-registration/real-metadata.json');
const gate = createGate();
async function main() {
  const manifestBytes = fs.readFileSync(path.join(__dirname, 'source.sha256.json'));
  const manifest = JSON.parse(manifestBytes);
  for (const [file, hash] of Object.entries(manifest)) assert.equal(sha(fs.readFileSync(path.resolve(__dirname, '../..', file))), hash);
  const question = gate.frozen.turns[0].query;
  assert.equal(sha(question), gate.frozen.question_sha256);
  assert.equal(fs.readFileSync(path.join(__dirname, 'question.sha256'), 'utf8').trim(), sha(question));
  assert.equal(course._id, gate.frozen.course_id);
  const api = backend({ courses: [course], user: { _id: gate.frozen.user_id, purchasedCourses: [course._id] },
    reply: 'OFFLINE PREFLIGHT ONLY. This text is a transport fixture, never a live AI answer.' });
  const request = { message: question, activeCourseId: gate.frozen.course_id, conversationId: gate.frozen.conversation_id,
    history: gate.frozen.initial_history, debugAi: true };
  const response = await api.chat(request);
  assert.equal(api.calls.length, 1, 'Question must assemble a provider request, not select a generic direct template');
  assert.equal(response.debug.selected_exact_prompt_template_id, '');
  assert.equal(response.debug.current_intent, 'troubleshooting');
  const payload = api.calls[0]; assert.equal(payload.model, gate.frozen.model);
  const system = payload.messages[0].content;
  for (const text of ['Student-specific solution plan', 'extra cheese aur lettuce', 'bun ka shape', 'lighting, shadows aur sharpness',
    'Burger bilkul original jaisa', 'never apply generic enhancements that contradict', 'one small verification check',
    'do not invent course instructions, tool settings or capabilities']) assert.ok(system.includes(text), text);
  assert.ok(payload.messages.at(-1).content.includes(question));
  assert.equal(response.debug.resolved_active_course_id, gate.frozen.course_id);
  assert.ok(response.debug.retrieved_course_ids.every(id => id === gate.frozen.course_id));
  const result = { offline: true, genuineProviderAnswer: false, realProviderCalls: 0, guidanceConfirmed: true,
    method: 'Existing deterministic backend fixture captured the normal serialized provider request with an injected offline fetch stub. Actual delivery remains pending explicit approval.',
    questionSHA256: sha(question), caseSHA256: gate.hash, sourceManifestSHA256: sha(manifestBytes),
    selectedRoutingPath: response.provider, selectedExactTemplate: response.debug.selected_exact_prompt_template_id,
    request, payload, retrievedKnowledge: response.debug };
  fs.writeFileSync(path.join(__dirname, 'preflight-provider-payload.json'), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ offlineGuidanceVerified: true, questionSHA256: sha(question), realProviderCalls: 0 }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
