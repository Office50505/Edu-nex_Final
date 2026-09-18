// Transport and history policy are independent of screen state and rendering.
export function conversationHistory(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter(item => item && !item.failed && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string' && item.content.trim())
    .slice(-12).map(({ role, content }) => ({ role, content: content.trim().slice(0, 2000) }));
}

export async function requestTutor({ baseUrl, user, question, courseId, messages, assistantName = 'AI', session, fetcher = fetch }) {
  const body = JSON.stringify({ message: question, history: conversationHistory(messages), userId: user?._id,
    sessionId: user?.sessionId, assistantName, ...(courseId ? { courseId } : {}) });
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
    if (!response.ok) throw new Error(response.status === 401 ? 'Please log in again to continue chatting.' : 'AI is unavailable. Please try again.');
    const data = await response.json();
    return tutorAnswer(data);
  } finally {
    clearTimeout(timer);
  }
}

function tutorAnswer(data) {
  const answer = data?.answer || data?.reply;
  if (typeof answer !== 'string' || !answer.trim()) throw new Error('AI returned an empty answer. Please try again.');
  return { answer, notice: data.notice || null, sources: Array.isArray(data.sources) ? data.sources : [] };
}
