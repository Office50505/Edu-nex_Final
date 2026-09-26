const crypto = require('node:crypto');

const AI_CONSENT_POLICY_VERSION = '2026-09-25';
const AI_PROVIDER_VERSION = `fal-openrouter:${process.env.FAL_OPENROUTER_MODEL || process.env.FAL_GEMINI_MODEL || 'google/gemini-2.5-flash'}`;
const PROVIDER_NAMES = ['fal.ai', 'OpenRouter', 'Google Gemini'];
const BLOCKED_INPUT_REPLY = 'I cannot help reveal private instructions, credentials, or protected course context. Ask me a learning question about the course instead.';
const PROMPT_LEAKAGE_PATTERN = /(?:reveal|show|print|repeat|dump|ignore).{0,50}(?:system prompt|developer message|hidden instructions|api key|secret|course context)|(?:jailbreak|prompt injection)/i;

function consentIsCurrent(user) {
  return Boolean(
    user?.aiConsentGranted
    && user?.aiConsentPolicyVersion === AI_CONSENT_POLICY_VERSION
    && user?.aiConsentProviderVersion === AI_PROVIDER_VERSION
  );
}

function checkAiInput(value) {
  if (typeof value !== 'string') return { ok: false, statusCode: 400, error: 'Message must be text.' };
  const message = value.trim();
  if (!message) return { ok: false, statusCode: 400, error: 'Message is required.' };
  if (message.length > 2000) return { ok: false, statusCode: 413, error: 'Message is too long. Use 2,000 characters or fewer.' };
  if (/\0|[\u0001-\u0008\u000B\u000C\u000E-\u001F]/.test(message)) {
    return { ok: false, statusCode: 400, error: 'Message contains unsupported characters.' };
  }
  if (PROMPT_LEAKAGE_PATTERN.test(message)) return { ok: false, blocked: true, reply: BLOCKED_INPUT_REPLY };
  return { ok: true, message };
}

function sanitizeAiOutput(value) {
  const configuredSecrets = [
    process.env.FAL_API_KEY,
    process.env.FAL_KEY,
    process.env.OPENROUTER_API_KEY,
    process.env.GEMINI_API_KEY,
  ].filter(secret => typeof secret === 'string' && secret.length >= 8);
  let output = String(value || '').slice(0, 6000);
  for (const secret of configuredSecrets) output = output.split(secret).join('[redacted]');
  output = output
    .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{20,})\b/g, '[redacted]')
    .replace(/(?:^|\n)\s*(?:system|developer)\s*(?:prompt|message)\s*:[\s\S]*/i, '\nI cannot provide private system instructions.');
  return output.trim();
}

function responseHash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

module.exports = {
  AI_CONSENT_POLICY_VERSION,
  AI_PROVIDER_VERSION,
  BLOCKED_INPUT_REPLY,
  PROVIDER_NAMES,
  checkAiInput,
  consentIsCurrent,
  responseHash,
  sanitizeAiOutput,
};
