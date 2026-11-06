import { assertAiAccount, ensureAiConsent } from './aiConsent';
import { askAiConsent } from './aiConsentPrompt';

// Transport and history policy are independent of screen state and rendering.
export function conversationHistory(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter(item => item && !item.privateAccount && item.provider !== 'skillomate-learner-facts' && !item.failed && !['provider_fallback', 'unavailable'].includes(item.outcome?.type) && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string' && item.content.trim())
    .slice(-12).map(({ role, content }) => ({ role, content: content.trim().slice(0, 2000) }));
}

export async function requestTutor({ user, question, courseId, activeCourseId, lessonId, conversationId, messages, assistantName = 'AI', session, decideConsent = askAiConsent }) {
  // This shared transport covers both Nex AI and the lesson's Course AI.
  // No prompt/history leaves the device until a current choice is saved.
  await ensureAiConsent({ session, user, decide: decideConsent });
  assertAiAccount(session, user);
  const body = JSON.stringify({ message: question, history: conversationHistory(messages),
    assistantName,
    ...(conversationId ? { conversationId } : {}),
    ...(lessonId ? { lessonId } : {}),
    ...(courseId ? { courseId } : {}),
    ...(!courseId && activeCourseId ? { activeCourseId } : {}) });
  const data = await session.requestJson('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  return tutorAnswer(data);
}

function tutorAnswer(data) {
  if (['provider_fallback', 'unavailable'].includes(data?.outcome?.type) || data?.provider === 'built-in-course-guide' && data?.outcome?.type !== 'local_rule') {
    throw Object.assign(new Error(data?.error || 'Nex AI is temporarily unavailable. Please try your question again shortly.'), { code: 'TUTOR_UNAVAILABLE', outcome: data?.outcome });
  }
  const answer = data?.answer || data?.reply;
  if (typeof answer !== 'string' || !answer.trim()) throw new Error('AI returned an empty answer. Please try again.');
  return { answer, privateAccount: data?.privateAccount === true, messageId: data?.messageId || null, provider: data?.provider || null, outcome: data?.outcome || null, notice: data.notice || null, sources: Array.isArray(data.sources) ? data.sources : [] };
}
