const fs = require('node:fs');
const path = require('node:path');
// Reuse the existing provider configuration and approval-file conventions;
// never open, reuse, truncate or reset the previous test's attempt ledger.
const { providerConfig, backendRoot, backendRequire, sha } = require('../chai-junction-live-retest/gate.cjs');
const sameHistory = (actual, expected) => Array.isArray(actual) && actual.length === expected.length
  && expected.every((item, index) => actual[index]?.role === item.role && actual[index]?.content === item.content);
const sanitized = history => history.map(({ role, content }) => ({ role, content: content.trim().slice(0, 2000) }));

function createGate({ directory = __dirname, configured = providerConfig(), now = Date.now } = {}) {
  const bytes = fs.readFileSync(path.join(directory, 'case.json'));
  const hash = sha(bytes), frozen = JSON.parse(bytes);
  const nativeApp = frozen.transport === 'ios-simulator';
  const singleNative = nativeApp && frozen.turns.length === 1;
  const turnCount = singleNative ? 1 : 2;
  const maxAttempts = singleNative ? 2 : 4;
  if (fs.readFileSync(path.join(directory, 'case.sha256'), 'utf8').trim() !== hash) throw Error('Frozen case checksum changed');
  if (frozen.turns.length !== turnCount || frozen.turns.some((turn, index) => turn.number !== index + 1)
    || frozen.max_provider_attempts !== maxAttempts || !frozen.conversation_id.startsWith(nativeApp ? 'nai-' : 'lba-memory-')) throw Error('Expected a bounded native single-question or two-turn memory-test profile');
  if (nativeApp && (!Array.isArray(frozen.initial_history) || frozen.initial_history.length !== 1
    || frozen.initial_history[0].role !== 'assistant' || typeof frozen.initial_history[0].content !== 'string'
    || frozen.initial_history[0].content.length > 2000)) throw Error('Expected the frozen native greeting');
  if (configured.model !== frozen.model || configured.url !== frozen.provider_url
    || configured.url !== 'https://fal.run/openrouter/router/openai/v1/chat/completions') throw Error('Provider model/endpoint differs from frozen case');
  const tracePath = path.join(directory, 'pipeline_traces.jsonl');
  const approvalPath = path.join(directory, 'provider_approval.json');
  function events() {
    return fs.existsSync(tracePath) ? fs.readFileSync(tracePath, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
  }
  function count() { return events().filter(event => event.type === 'provider_invoked').length; }
  function event(type, data = {}) {
    const fd = fs.openSync(tracePath, 'a', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify({ time: new Date(now()).toISOString(), case: frozen.suite, type, ...data }) + '\n');
      if (type === 'provider_invoked') fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
  }
  function approval() {
    try {
      if (sha(fs.readFileSync(path.join(directory, 'case.json'))) !== hash) return null;
      const value = JSON.parse(fs.readFileSync(approvalPath));
      const issued = Date.parse(value.issued_at), expires = Date.parse(value.expires_at);
      return value.approved === true && value.model === frozen.model && value.cases_sha256 === hash
        && value.turns_sha256 === sha(JSON.stringify(frozen.turns)) && value.course_id === frozen.course_id
        && value.user_id === frozen.user_id && value.conversation_id === frozen.conversation_id && value.max_calls === maxAttempts
        && issued <= now() && expires > now() && expires > issued && expires - issued <= 30 * 60_000 ? value : null;
    } catch { return null; }
  }
  function completedTurn(number) {
    return events().find(item => item.type === 'chat_response' && item.turn === number
      && item.conversation_id === frozen.conversation_id && item.user_id === frozen.user_id
      && item.request?.activeCourseId === frozen.course_id && item.request?.message === frozen.turns[number - 1].query
      && item.httpStatus === 200 && item.response?.provider === 'fal-openrouter'
      && item.response?.outcome?.liveModelAnswer === true && typeof item.response.answer === 'string');
  }
  function expectedHistory(number) {
    const initial = nativeApp ? frozen.initial_history : [];
    if (number === 1) return initial;
    const first = completedTurn(1);
    if (!first) throw Error('Turn 2 requires the recorded genuine Turn 1 answer');
    const history = [...initial, { role: 'user', content: frozen.turns[0].query }, { role: 'assistant', content: first.response.answer }];
    return nativeApp ? sanitized(history) : history;
  }
  function consume(payload, context) {
    const permitted = approval(), req = context?.req, knowledge = context?.knowledge;
    const turn = nativeApp ? frozen.turns.find(item => item.query === req?.body?.message)?.number : Number(req?.headers?.['x-memory-turn']);
    let reason, history;
    if (!permitted) reason = 'awaiting_explicit_approval_or_expired';
    else if (count() >= maxAttempts) reason = 'provider_attempt_budget_exhausted';
    else if (!frozen.turns.some(item => item.number === turn)) reason = 'invalid_turn';
    else if (completedTurn(turn)) reason = 'turn_already_completed';
    else if (context?.path !== '/api/ai/chat' || req.method !== 'POST'
      || (!nativeApp && req.headers['x-memory-live-case'] !== hash) || req.body?.message !== frozen.turns[turn - 1].query
      || req.body?.activeCourseId !== frozen.course_id || req.body?.conversationId !== frozen.conversation_id
      || String(req.compatAuth?.userId) !== frozen.user_id || knowledge?.activeCourse?.id !== frozen.course_id
      || !knowledge?.materialsAvailable) reason = 'question_conversation_account_or_course_mismatch';
    if (!reason) {
      try { history = expectedHistory(turn); } catch { reason = 'first_live_turn_missing'; }
    }
    if (!reason && (!sameHistory(req.body.history, history) || !sameHistory(knowledge.conversationHistory, sanitized(history)))) reason = 'actual_previous_exchange_missing_or_changed';
    if (!reason && (payload.model !== frozen.model || !Number.isFinite(payload.max_tokens) || payload.max_tokens <= 0 || payload.max_tokens > 900
      || JSON.stringify(payload).length > 120000 || payload.messages?.[0]?.role !== 'system'
      || !payload.messages?.at(-1)?.content?.includes(frozen.turns[turn - 1].query)
      || !sameHistory(payload.messages.slice(1, -1), sanitized(history)))) reason = 'provider_payload_or_history_mismatch';
    if (reason) { event('provider_blocked', { reason, turn, conversation_id: req?.body?.conversationId }); throw Error(reason); }
    // Every outgoing generation, retry and repair consumes the same new ledger.
    // The append is fsynced before transport and reconstructed after restarts.
    const attempt = count() + 1;
    event('provider_invoked', { call: attempt, turn, model: frozen.model,
      conversation_id: frozen.conversation_id, approval_id: permitted.approval_id });
    return attempt;
  }
  return { frozen, hash, configured, tracePath, approvalPath, event, count, approval, consume, completedTurn, expectedHistory };
}
module.exports = { createGate, providerConfig, backendRoot, backendRequire, sha, sameHistory, sanitized };
