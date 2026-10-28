// Uses the existing evaluator's approval schema and persistent provider_invoked
// ledger. This profile permits only the single frozen LBA-MANUAL-02 request.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const backendRoot = path.resolve(__dirname, '../../edunex-b');
const backendRequire = createRequire(path.join(backendRoot, 'server.js'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function providerConfig() {
  const dotenv = backendRequire('dotenv');
  const config = Object.assign({}, ...['.env', '.env.local']
    .filter(file => fs.existsSync(path.join(backendRoot, file)))
    .map(file => dotenv.parse(fs.readFileSync(path.join(backendRoot, file)))));
  return { key: config.FAL_API_KEY || config.FAL_KEY || '',
    model: config.FAL_OPENROUTER_MODEL || config.FAL_GEMINI_MODEL || 'google/gemini-2.5-flash',
    url: config.FAL_OPENROUTER_URL || 'https://fal.run/openrouter/router/openai/v1/chat/completions' };
}

function createGate({ directory = __dirname, configured = providerConfig(), now = Date.now } = {}) {
  const bytes = fs.readFileSync(path.join(directory, 'case.json'));
  const hash = sha(bytes);
  if (fs.readFileSync(path.join(directory, 'case.sha256'), 'utf8').trim() !== hash) throw Error('Frozen case checksum changed');
  const frozen = JSON.parse(bytes);
  if (frozen.cases.length !== 1 || frozen.cases[0].turns.length !== 1 || frozen.max_provider_attempts !== 2) throw Error('Expected exactly one frozen question and two maximum attempts');
  const question = frozen.cases[0].turns[0].query;
  if (configured.model !== frozen.model || configured.url !== frozen.provider_url
    || configured.url !== 'https://fal.run/openrouter/router/openai/v1/chat/completions') throw Error('Provider configuration differs from frozen model/endpoint');
  const tracePath = path.join(directory, 'pipeline_traces.jsonl');
  const approvalPath = path.join(directory, 'provider_approval.json');
  function events() {
    return fs.existsSync(tracePath) ? fs.readFileSync(tracePath, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
  }
  function count() { return events().filter(event => event.type === 'provider_invoked').length; }
  function event(type, data = {}) {
    fs.appendFileSync(tracePath, JSON.stringify({ time: new Date(now()).toISOString(), case: 'LBA-MANUAL-02', type, ...data }) + '\n', { mode: 0o600 });
  }
  function approval() {
    try {
      if (sha(fs.readFileSync(path.join(directory, 'case.json'))) !== hash) return null;
      const value = JSON.parse(fs.readFileSync(approvalPath));
      const issued = Date.parse(value.issued_at), expires = Date.parse(value.expires_at);
      return value.approved === true && value.model === frozen.model && value.cases_sha256 === hash
        && value.question_sha256 === sha(question) && value.course_id === frozen.course_id
        && value.user_id === frozen.user_id && value.max_calls === 2
        && issued <= now() && expires > now() && expires > issued && expires - issued <= 30 * 60_000
        ? value : null;
    } catch { return null; }
  }
  function consume(payload, context) {
    const permitted = approval();
    const req = context?.req, knowledge = context?.knowledge;
    let reason;
    if (!permitted) reason = 'awaiting_explicit_approval_or_expired';
    else if (count() >= 2) reason = 'provider_attempt_budget_exhausted';
    else if (context.path !== '/api/ai/chat' || req.method !== 'POST'
      || req.headers['x-single-live-case'] !== hash
      || req.body?.message !== question || req.body?.activeCourseId !== frozen.course_id
      || !Array.isArray(req.body?.history) || req.body.history.length
      || String(req.compatAuth?.userId) !== frozen.user_id
      || knowledge?.activeCourse?.id !== frozen.course_id || !knowledge?.materialsAvailable
      || knowledge?.conversationHistory?.length) reason = 'request_identity_question_or_course_mismatch';
    else if (payload.model !== frozen.model || !Number.isFinite(payload.max_tokens) || payload.max_tokens > 900
      || JSON.stringify(payload).length > 120000
      || !payload.messages?.at(-1)?.content?.includes(question)) reason = 'provider_payload_mismatch';
    if (reason) { event('provider_blocked', { reason }); throw Error(reason); }
    // The debit is durable BEFORE transport. Failures, retries and repairs all
    // consume this same counter, which is reconstructed after process restarts.
    const attempt = count() + 1;
    event('provider_invoked', { call: attempt, model: frozen.model,
      conversation_id: req.body.conversationId, approval_id: permitted.approval_id });
    return attempt;
  }
  return { frozen, question, hash, configured, tracePath, approvalPath, event, count, approval, consume };
}
module.exports = { createGate, providerConfig, backendRoot, backendRequire, sha };
