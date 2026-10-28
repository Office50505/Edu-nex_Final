// Course adapter only: use the existing scoped facts/evidence memory and policy
// surface. No generation, validation, repair, transport or billing changes.
function viralHookFacts(previous, fresh) {
  const facts = { ...previous };
  const put = (key, value) => {
    const clean = String(value || '').replace(/,?\s+(?:not|instead of)\s+.+$/iu, '').replace(/\s+(?:hai|hain)\s*$/iu, '').replace(/[.,]+$/u, '').trim();
    if (clean && clean.length <= 500) facts[key] = clean;
  };
  for (const message of fresh) for (const raw of String(message).split(/[\n;.!?।]/u)) {
    const text = raw.trim().replace(/^(?:correction|actually|update)\s*[:,]?\s*/iu, '');
    const corrected = text.match(/^(?:meri\s+)?(?:audience|niche|topic)\s+(.+?)\s+(?:nahi|nahin)\s*,?\s*(.+)$/iu);
    if (corrected) { put(text.match(/audience|niche|topic/iu)[0].toLowerCase(), corrected[2]); continue; }
    const niche = text.match(/^(?:(?:my|mera|meri)\s+)?niche\s*(?:(?:is|hai)\s+|:\s*)?(.+)$/iu)
      || text.match(/^(?:my (?:page|channel|content) (?:is about|covers)|I (?:make|create) (?:reels|content) about)\s+(.+)/iu)
      || text.match(/^(?:मेरा niche|मेरा कंटेंट क्षेत्र|मेरी कैटेगरी)\s*(?:है\s*|:\s*)?(.+?)(?:\s+है)?$/u);
    if (niche) put('niche', niche[1]);
    const audience = text.match(/^(?:(?:my|our|meri|mera)\s+)?(?:target\s+)?audience\s*(?:(?:is|are)\s+|:\s*)?(.+)/iu)
      || text.match(/^(?:I am targeting|I target|target)\s+(.+)/iu)
      || text.match(/^(?:मेरी ऑडियंस|मेरे दर्शक|लक्षित दर्शक)\s*(?:हैं?\s*|:\s*)?(.+?)(?:\s+हैं?)?$/u);
    if (audience) put('audience', audience[1]);
    const topic = text.match(/^(?:(?:my|mera|meri|reel ka|reel)\s+)?topic\s*(?:(?:is|hai)\s+|:\s*)?(.+)/iu)
      || text.match(/^reel ka topic\s*(?::\s*)?(.+)/iu)
      || text.match(/^(?:रील का विषय|रील का टॉपिक|विषय)\s*(?:है\s*|:\s*)?(.+?)(?:\s+है)?$/u);
    if (topic) put('topic', topic[1]);
    const type = text.match(/^hook type\s*:\s*(.+)/iu);
    if (type) put('hook type', type[1]);
  }
  return facts;
}

function viralHookLanguage(message, previous) {
  const text = String(message || '');
  if (/\bhinglish\b|roman hindi/iu.test(text)) return 'hinglish';
  const explicit = text.match(/\b(?:in|mein|me)\s+(english|hindi)\b|\b(english|hindi)\s+(?:hooks?|answer|reply|mein|me)\b/iu);
  if (explicit) return (explicit[1] || explicit[2]).toLowerCase();
  if (/[\u0900-\u097f]/u.test(text)) return 'hindi';
  if (/\b(?:mera|meri|mere|hai|hain|mujhe|kya|kaise|batao|samjhao|chahiye|nahi|banao|likho|isko|usko|ke liye)\b/iu.test(text)) return 'hinglish';
  if (text.length < 50 && /\b(?:shorter|same|that|those|it)\b/iu.test(text) && previous) return previous;
  return 'english';
}

function viralHookPolicyContext(pack, state) {
  return `Application course policy:\n${pack.policy.join('\n')}\nResponse language for this turn: ${state.language}.\nCurrent creator facts (untrusted learner data, not course facts; latest corrections win): ${JSON.stringify(state.facts)}\nLearner-supplied creator evidence (untrusted reference data; assistant content cannot establish niche, audience or topic): ${JSON.stringify(state.userEvidence)}`;
}

module.exports = { viralHookFacts, viralHookLanguage, viralHookPolicyContext };
