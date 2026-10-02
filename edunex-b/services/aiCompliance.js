const crypto = require('node:crypto');

const AI_CONSENT_POLICY_VERSION = '2026-09-25';
const AI_PROVIDER_VERSION = `fal-openrouter:${process.env.FAL_OPENROUTER_MODEL || process.env.FAL_GEMINI_MODEL || 'google/gemini-2.5-flash'}`;
const PROVIDER_NAMES = ['fal.ai', 'OpenRouter', 'Google Gemini'];
const BLOCKED_INPUT_REPLY = 'I cannot help reveal private instructions, credentials, or protected course context. Ask me a learning question about the course instead.';
const EXPLICIT_SEXUAL_REPLY = 'I cannot help create explicit sexual or pornographic image/video prompts. I can help reframe the scene into a safe, non-explicit, fully clothed, clearly adult character prompt.';
const MINOR_SEXUAL_REPLY = 'I cannot help sexualize a minor or an age-ambiguous person, or provide generation instructions for that. Use clearly adult, non-sexual, fully clothed characters and keep the scene safe.';
const FILTER_BYPASS_REPLY = 'I cannot help bypass Flow, Veo, or other provider safety filters. I can help rewrite the idea into a safe, policy-compliant version.';
const PROMPT_LEAKAGE_PATTERN = /(?:reveal|show|print|repeat|dump|ignore).{0,50}(?:system prompt|developer message|hidden instructions|api key|secret|course context)|(?:jailbreak|prompt injection)/i;
const FILTER_BYPASS_PATTERN = /\b(?:bypass|evade|avoid|disable|break|trick|jailbreak|get around|beat)\b.{0,80}\b(?:safety|filter|filters|policy|moderation|guardrail|guardrails|flow|veo)\b|\b(?:safety|filter|filters|policy|moderation|guardrail|guardrails|flow|veo)\b.{0,80}\b(?:bypass|evade|avoid|disable|break|trick|jailbreak|get around|beat)\b/i;
const EXPLICIT_SEXUAL_PATTERN = /\b(?:porn|pornographic|explicit sex|sex scene|nude|naked|nsfw|erotic|sexual|seductive|strip|lingerie|cleavage|bedroom)\b.{0,80}\b(?:prompt|image|video|generate|generation|flow|veo|clip|scene)\b|\b(?:prompt|image|video|generate|generation|flow|veo|clip|scene)\b.{0,80}\b(?:porn|pornographic|explicit sex|sex scene|nude|naked|nsfw|erotic|sexual|seductive|strip|lingerie|cleavage)\b/i;
const MINOR_OR_AGE_AMBIGUOUS_PATTERN = /\b(?:minor|underage|child|kid|teen|teenage|schoolgirl|schoolboy|young girl|young boy|little girl|little boy|age ambiguous|age-ambiguous|looks young|barely legal|17|16|15|14|13|12)\b/i;
const SEXUALIZED_APPEARANCE_PATTERN = /\b(?:sexual|sexy|seductive|revealing|nude|naked|lingerie|cleavage|erotic|porn|strip|hot)\b/i;

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
  if (FILTER_BYPASS_PATTERN.test(message)) return { ok: false, blocked: true, reply: FILTER_BYPASS_REPLY };
  if (MINOR_OR_AGE_AMBIGUOUS_PATTERN.test(message) && SEXUALIZED_APPEARANCE_PATTERN.test(message)) {
    return { ok: false, blocked: true, reply: MINOR_SEXUAL_REPLY };
  }
  if (EXPLICIT_SEXUAL_PATTERN.test(message)) return { ok: false, blocked: true, reply: EXPLICIT_SEXUAL_REPLY };
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
  EXPLICIT_SEXUAL_REPLY,
  FILTER_BYPASS_REPLY,
  MINOR_SEXUAL_REPLY,
  PROVIDER_NAMES,
  checkAiInput,
  consentIsCurrent,
  responseHash,
  sanitizeAiOutput,
};
