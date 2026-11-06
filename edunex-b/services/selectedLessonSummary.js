// An extractive summary for the player's built-in action. Other questions still
// use the tutor provider; a provider outage must not masquerade as an AI answer.
function selectedLessonSummary({ message, knowledge }) {
  if (!/^(?:please\s+)?summari[sz]e\s+(?:this|the(?:\s+current)?|current)\s+(?:video|lesson)(?:\s+(?:briefly|for me))?[.!?]*$/iu.test(String(message || '').trim())) return '';
  // Only use context already authorized and scoped by buildContext. Never use
  // lesson text supplied in the request, another lesson, or the public catalog.
  if (!knowledge?.materialsAvailable || !knowledge.activeCourse || !knowledge.activeLesson) return '';
  const title = String(knowledge.activeLesson.title || 'Selected lesson').trim();
  const excerpt = String(knowledge.activeLessonExcerpt || '').replace(/^\[S\d+\]\s*/gm, '').trim();
  if (!excerpt) return '';
  const compact = text => text.replace(/\s+/gu, ' ').trim();
  const sections = [...new Set(excerpt.split(/\n\s*\n/gu).map(compact))]
    .filter(text => text && text !== title)
    .slice(0, 4)
    .map(text => text.length > 700 ? `${text.slice(0, 697).trimEnd()}…` : text);
  if (!sections.length) return '';
  return `${title}\n\nSummary from saved lesson material (not a video transcript):\n\n${sections.map(text => `• ${text}`).join('\n\n')}`;
}

module.exports = { selectedLessonSummary };
