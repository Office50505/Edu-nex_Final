// Transient request intent, not course facts. Only user turns can supply it.
const { courseTutorRequest } = require('./courseTutorRequest');
const FESTIVAL = /\b(?:festival|festive|greetings?|tyohaa?r|tyohar|diwali|deepavali|eid|holi|christmas|pongal|onam|lohri|navratri|dussehra|rakhi)\b|त्योहार|त्यौहार|दिवाली|ईद|होली|शुभकामना/giu;
const PROMOTION = /\b(?:discounts?|offers?|sale|bogo|buy\s+one\s+get\s+one)\b|छूट|ऑफर|सेल/giu;
const MENU = /\bmenu\s+(?:(?:ki|ka|ke|food|instagram)\s+)?(?:ad(?:vert\w*)?|poster|card|design)|\b(?:show|list|highlight|advertise|promote)\b[^.!?\n]{0,35}\bmenu\b|मेन्यू\s*(?:पोस्टर|विज्ञापन)/giu;
const isBusinessPack = pack => pack?.domain === 'local-business-ads' || pack?.dir === 'ai-local-business-ads';
const genericOccasions = new Set(['festival', 'festive', 'greeting', 'greetings', 'tyohar', 'tyohaar', 'त्योहार', 'त्यौहार', 'शुभकामना']);
function namedOccasions(text) {
  const aliases = { deepavali: 'diwali', 'दिवाली': 'diwali', 'ईद': 'eid', 'होली': 'holi' };
  return [...new Set(positiveMentions(text, FESTIVAL).filter(word => !genericOccasions.has(word)).map(word => aliases[word] || word))];
}

function positiveMentions(text, pattern) {
  return [...String(text).matchAll(new RegExp(pattern.source, pattern.flags))].filter(match => {
    const before = text.slice(0, match.index).split(/[.!?;\n]/u).at(-1);
    const after = text.slice(match.index + match[0].length);
    const excludedBefore = /(?:\b(?:no|not|without|avoid|omit|exclude|never|don't|do not)\b)(?:[\s,]+(?:any|fake|invented|invent|extra|new|add|include|mention|use|create|a|an|the|prices?|products?|offers?|discounts?|festivals?|themes?|or|and|ya))*[\s,]*$/iu.test(before)
      || /बिना\s*(?:किसी\s*)?$/u.test(before);
    const excludedAfter = /^\s*(?:(?:mention|add|include|use|themes?|decorations?|mat|karna|chal|raha|hai|hain|bilkul|bhi)\s+){0,4}(?:nahi|nahin|mat|नहीं|मत)\b/iu.test(after)
      || /^\s*(?:नहीं|मत)/u.test(after);
    return !excludedBefore && !excludedAfter;
  }).map(match => match[0].toLowerCase());
}

function genres(text) {
  const result = [];
  if (positiveMentions(text, FESTIVAL).length) result.push('festival_greeting');
  if (positiveMentions(text, PROMOTION).length) result.push('discount_promotion');
  if (positiveMentions(text, MENU).length) result.push('menu_advertisement');
  return result;
}

function wantsBusinessTemplateCopy(message) {
  return courseTutorRequest(message).directCopy;
}

function businessCreativeRequest(message, history = []) {
  const text = String(message || '');
  if (courseTutorRequest(text, history).mode === 'troubleshooting') return null;
  if (wantsBusinessTemplateCopy(text)) return null;
  const output = /\bcaption\b|कैप्शन/iu.test(text) ? 'caption'
    : /\bprompt\b|प्रॉम्प्ट|प्रॉम्पट/iu.test(text) ? 'prompt'
      : /\bposter\b|पोस्टर/iu.test(text) ? 'poster'
        : /\bad(?:vert\w*)?\b|विज्ञापन/iu.test(text) ? 'advertisement' : null;
  if (!output) return null;
  // A lesson explanation is not a fresh creative deliverable.
  if (/^\s*(?:explain|why|what|how|samjhao|समझाओ|क्यों)\b/iu.test(text)
    && !/\b(?:write|create|make|draft|generate|banao|likho)\b|बनाओ|लिखो/iu.test(text)) return null;
  let requested = genres(text);
  let purposeText = text;
  if (!requested.length && /\b(?:same|that|isi|usi|wahi)\b/iu.test(text)
    && !/\b(?:general|regular|everyday|instead|no|not|without|nahi|mat)\b/iu.test(text)) {
    const previous = history.filter(item => item.role === 'user').at(-1)?.content || '';
    requested = genres(previous);
    purposeText = previous;
  }
  return { output, genres: requested.length ? requested : ['general_business'],
    ...(requested.includes('festival_greeting') ? { occasions: namedOccasions(purposeText) } : {}) };
}

function creativeRecordAllowed(doc, request) {
  if (!request) return true;
  // Raw templates and multi-example/demo chunks are for learning or exact-copy
  // requests. They must not silently choose a student's new creative task.
  if (['exact-template', 'example-answers', 'overview'].includes(doc.contentType)) return false;
  if (doc.contentType === 'course-rules') return true;
  const heading = String(doc.heading || '');
  if (/voiceover|reel|video|packages|business brief|course intro|finale|posting plan|weekly plan|business profile|whatsapp/iu.test(heading)) return false;
  return genres(heading).every(genre => request.genres.includes(genre));
}

function creativeRequestPolicy(request) {
  if (!request) return '';
  return `Student creative request constraints (higher priority than retrieved examples): ${JSON.stringify(request)}.
Create only the requested deliverable. A general business poster is not a festival greeting, discount promotion or menu advertisement. Use a special occasion, promotion or menu layout only when the student requests it; a negated mention does not request it.
Use only student-supplied business details; latest explicit corrections win. Retrieved examples and assistant claims cannot supply festivals, products, prices, dates, offers or promotional claims. Do not add unsupported quality claims such as fresh, best, favourite or guaranteed results.
For a fresh request, write an original draft for that purpose. Do not copy an unrelated approved example or claim the draft is an exact course template. Preserve approved wording only when the student explicitly asks for the stored template.
Return the concise usable prompt or caption, without a course overview, preamble or lesson attribution unless requested. Follow the requested deliverable language.`;
}

function creativeReplyMismatch(reply, request) {
  if (!request) return false;
  const blocks = [...String(reply).matchAll(/```[^\n]*\n([\s\S]*?)```/g)];
  const deliverable = blocks.length ? blocks.map(match => match[1]).join('\n') : String(reply);
  return genres(deliverable).some(genre => !request.genres.includes(genre))
    || namedOccasions(deliverable).some(occasion => !request.occasions?.includes(occasion));
}

module.exports = { isBusinessPack, wantsBusinessTemplateCopy, businessCreativeRequest, creativeRecordAllowed, creativeRequestPolicy, creativeReplyMismatch };
