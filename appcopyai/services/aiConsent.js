// Server records are authoritative. Never persist an "allowed" shortcut locally.
function changed() { return Object.assign(new Error('The signed-in account changed.'), { code: 'SESSION_CHANGED' }); }
export function assertAiAccount(session, user) {
  const current = session?.getUser();
  if (!current || !user?._id || current._id !== user._id || current.sessionId !== user.sessionId) throw changed();
}
function checkedState(state) {
  // Fail closed against the old backend that unconditionally returned granted:true.
  if (state?.consentRequired !== true || typeof state.granted !== 'boolean'
    || !state.policyVersion || !state.providerVersion || !state.disclosure
    || !Array.isArray(state.providerNames) || !state.providerNames.length) {
    throw Object.assign(new Error('AI privacy settings are unavailable. Please try again later.'), { code: 'AI_CONSENT_UNAVAILABLE' });
  }
  return state;
}
export async function readAiConsent({ session, user }) {
  assertAiAccount(session, user);
  const state = checkedState(await session.requestJson('/api/ai/consent', { method: 'GET' }));
  assertAiAccount(session, user);
  return state;
}
export async function saveAiConsent({ session, user, state, granted }) {
  assertAiAccount(session, user);
  const saved = checkedState(await session.requestJson('/api/ai/consent', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ granted, policyVersion: state.policyVersion, providerVersion: state.providerVersion }),
  }));
  assertAiAccount(session, user);
  if (saved.granted !== granted || (granted && (!saved.decidedAt
    || saved.policyVersion !== state.policyVersion || saved.providerVersion !== state.providerVersion))) {
    throw new Error('AI privacy choice could not be saved. Please review the current information and try again.');
  }
  return saved;
}
export async function ensureAiConsent({ session, user, decide }) {
  const state = await readAiConsent({ session, user });
  if (state.granted && state.decidedAt) return state;
  const allowed = await decide(state);
  assertAiAccount(session, user);
  await saveAiConsent({ session, user, state, granted: allowed === true });
  if (allowed !== true) throw Object.assign(new Error('AI data sharing is off. You can continue using your courses.'), { code: 'AI_CONSENT_DECLINED' });
}
