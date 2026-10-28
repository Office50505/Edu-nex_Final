const APPROVAL_BLOCKS = new Set(['awaiting_explicit_approval_or_expired', 'provider_attempt_budget_exhausted',
  'invalid_turn', 'turn_already_completed', 'question_conversation_account_or_course_mismatch',
  'first_live_turn_missing', 'actual_previous_exchange_missing_or_changed', 'provider_payload_or_history_mismatch',
  'request_identity_question_or_course_mismatch', 'provider_payload_mismatch']);
for (const reason of ['awaiting_approval', 'expired', 'closed', 'invalid_approval', 'invalid_session',
  'budget_exhausted', 'scope_denied', 'model_mismatch', 'environment_mismatch', 'invalid_payload',
  'ledger_invalid', 'accounting_busy']) APPROVAL_BLOCKS.add(`manual_qa_${reason}`);

class TutorProviderError extends Error {
  constructor(code, diagnostics) { super(`Tutor provider ${code}`); this.name = 'TutorProviderError'; this.code = code; this.diagnostics = diagnostics; }
}

function errorCode(error) {
  // The existing approval transport rejects before making a paid request.
  // Preserve these exact gate reasons; retrying cannot obtain authorization.
  if (APPROVAL_BLOCKS.has(error?.code)) return error.code;
  if (APPROVAL_BLOCKS.has(error?.message)) return error.message;
  if (error?.name === 'SyntaxError') return 'invalid_response';
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'timeout';
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(error?.cause?.code || error?.code)) return 'dns_error';
  return 'connection_error';
}

async function requestTutorProvider({ url, key, payload, extractText, fetchImpl = globalThis.fetch,
  totalTimeoutMs = 25000, maxAttempts = 2, now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const start = now();
  let code = 'connection_error';
  const attempts = [];
  const limit = Math.max(1, Math.min(2, maxAttempts));
  for (let i = 0; i < limit; i++) {
    const remaining = totalTimeoutMs - (now() - start);
    if (remaining <= 0) break;
    const attempt = { attempt: i + 1, status: 'started', httpStatus: null };
    attempts.push(attempt);
    const attemptStart = now();
    try {
      const response = await fetchImpl(url, { method: 'POST', signal: AbortSignal.timeout(Math.max(1, remaining)),
        headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      attempt.httpStatus = response.status || (response.ok ? 200 : null);
      if (!response.ok) {
        code = response.status === 429 ? 'rate_limited' : response.status >= 500 ? 'upstream_error' : 'request_rejected';
        attempt.status = code;
        // Never retain error bodies: providers can echo credentials or prompts in them.
        await response.body?.cancel?.();
        if (!['rate_limited','upstream_error'].includes(code)) break;
      } else {
        const data = (response.headers.get('content-type') || '').includes('application/json') ? await response.json() : await response.text();
        const text = extractText(data).trim();
        if (!text) { code = 'empty_response'; attempt.status = code; break; }
        attempt.status = 'success';
        attempt.durationMs = now() - attemptStart;
        return { text, diagnostics: { status: 'success', attempts, durationMs: now() - start,
          finishReason: data?.choices?.[0]?.finish_reason || null,
          usage: data?.usage ? { prompt_tokens: Number(data.usage.prompt_tokens) || 0, completion_tokens: Number(data.usage.completion_tokens) || 0 } : null } };
      }
    } catch (error) { code = errorCode(error); attempt.status = code; }
    finally { attempt.durationMs = now() - attemptStart; }
    if (code === 'invalid_response' || APPROVAL_BLOCKS.has(code)) break;
    if (i + 1 < limit && totalTimeoutMs - (now() - start) > 200) await sleep(100);
  }
  throw new TutorProviderError(code, { status: code, attempts, durationMs: now() - start });
}

module.exports = { requestTutorProvider, TutorProviderError, errorCode };
