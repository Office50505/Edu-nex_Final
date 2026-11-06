const crypto = require('node:crypto');
const User = require('../models/User');

// Change the policy version whenever disclosure/data practices change. The provider
// fingerprint also invalidates consent when the deployed model or endpoint changes.
const policyVersion = '2026-11-06.2';
const model = process.env.FAL_OPENROUTER_MODEL || process.env.FAL_GEMINI_MODEL || 'google/gemini-2.5-flash';
const endpoint = process.env.FAL_OPENROUTER_URL || 'https://fal.run/openrouter/router/openai/v1/chat/completions';
const providerNames = ['fal.ai', 'OpenRouter', model.startsWith('google/') ? 'Google Gemini' : `Model provider: ${model.split('/')[0]}`];
const disclosure = `To answer your questions, Skillomate shares your message, up to 12 recent chat messages, relevant course/lesson material and learning context with ${providerNames.join(', ')} (model: ${model}). Your chosen tutor name may also be included. Skillomate does not automatically attach your account profile, contact details, age, gender, membership or payment records. Account answers generated within Skillomate are excluded from external AI history. Personal information you type into a message can still be shared as part of that message. These providers process this information to generate AI replies. Avoid passwords, payment credentials or other sensitive information in messages. AI is optional: declining does not affect course access. You can withdraw permission in Nex AI > Chat history > AI Data Controls. Withdrawal stops future AI requests; use Delete AI history to delete saved Skillomate chats. Information already processed by providers cannot be recalled by withdrawal.`;
const providerVersion = crypto.createHash('sha256').update(JSON.stringify({ model, endpoint, providerNames, disclosure })).digest('hex');

function consentState(record) {
  return {
    consentRequired: true,
    policyVersion, providerVersion, providerNames, disclosure,
    privacyUrl: 'https://skillomate.in/privacy',
    granted: record?.granted === true && record.policyVersion === policyVersion
      && record.providerVersion === providerVersion && Boolean(record.decidedAt),
    decidedAt: record?.decidedAt || null,
  };
}
function consentError(message = 'Allow AI data sharing before using Nex AI.') {
  return Object.assign(new Error(message), { code: 'AI_CONSENT_REQUIRED', statusCode: 403 });
}
async function readConsent(userId) {
  const user = await User.findById(userId).select('isActive +aiConsent').lean();
  if (!user || user.isActive === false) throw Object.assign(new Error('Invalid session'), { statusCode: 401 });
  return consentState(user.aiConsent);
}
async function requireAiConsent(userId) {
  const state = await readConsent(userId);
  if (!state.granted) throw consentError();
  return state;
}
async function saveConsent(userId, decision) {
  if (typeof decision?.granted !== 'boolean') {
    throw Object.assign(new Error('Choose whether to allow AI data sharing.'), { statusCode: 400 });
  }
  // A refusal/withdrawal is always accepted, including from a stale client.
  if (decision.granted && (decision.policyVersion !== policyVersion || decision.providerVersion !== providerVersion)) {
    throw Object.assign(new Error('AI privacy information changed. Review it again before allowing.'), { code: 'AI_CONSENT_POLICY_CHANGED', statusCode: 409 });
  }
  const record = { granted: decision.granted, policyVersion, providerVersion, decidedAt: new Date() };
  const result = await User.updateOne({ _id: userId, isActive: { $ne: false } }, { $set: { aiConsent: record } }, { runValidators: true });
  if (result.matchedCount !== 1) throw Object.assign(new Error('Invalid session'), { statusCode: 401 });
  return consentState(record);
}
module.exports = { consentState, readConsent, requireAiConsent, saveConsent };
