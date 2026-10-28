// Transport and history policy are independent of screen state and rendering.
export function conversationHistory(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter(item => item && !item.failed && !['provider_fallback', 'unavailable'].includes(item.outcome?.type) && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string' && item.content.trim())
    .slice(-12).map(({ role, content }) => ({ role, content: content.trim().slice(0, 2000) }));
}

export async function requestTutor({ baseUrl, user, question, courseId, activeCourseId, lessonId, conversationId, messages, assistantName = 'AI', session, fetcher = fetch }) {
  const body = JSON.stringify({ message: question, history: conversationHistory(messages),
    assistantName,
    ...(conversationId ? { conversationId } : {}),
    ...(lessonId ? { lessonId } : {}),
    ...(courseId ? { courseId } : {}),
    ...(!courseId && activeCourseId ? { activeCourseId } : {}) });
  if (session) {
    const current = session.getUser();
    if (!current || current._id !== user?._id || current.sessionId !== user?.sessionId) {
      throw Object.assign(new Error('The signed-in account changed.'), { code: 'SESSION_CHANGED' });
    }
    const data = await session.requestJson('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    return tutorAnswer(data);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetcher(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user?.accessToken || user?.token || ''}` },
      body,
    });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(response.status === 401 ? 'Please log in again to continue chatting.' : data?.error || 'Nex AI is temporarily unavailable. Please try again.'), { status: response.status, code: data?.code, outcome: data?.outcome });
    return tutorAnswer(data);
  } finally {
    clearTimeout(timer);
  }
}

function tutorAnswer(data) {
  if (['provider_fallback', 'unavailable'].includes(data?.outcome?.type) || data?.provider === 'built-in-course-guide' && data?.outcome?.type !== 'local_rule') {
    throw Object.assign(new Error(data?.error || 'Nex AI is temporarily unavailable. Please try your question again shortly.'), { code: 'TUTOR_UNAVAILABLE', outcome: data?.outcome });
  }
  const answer = data?.answer || data?.reply;
  if (typeof answer !== 'string' || !answer.trim()) throw new Error('AI returned an empty answer. Please try again.');
  return { answer, messageId: data?.messageId || null, provider: data?.provider || null, outcome: data?.outcome || null, notice: data.notice || null, sources: Array.isArray(data.sources) ? data.sources : [] };
}
