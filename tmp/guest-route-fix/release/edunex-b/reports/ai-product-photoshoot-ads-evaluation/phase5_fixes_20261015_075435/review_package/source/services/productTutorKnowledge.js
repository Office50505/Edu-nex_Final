const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PRODUCT_SLUGS = new Set([
  'ai-product-photoshoot-ads-course', 'ai-product-photoshoot-ads',
  'ai-product-photoshoot-and-ads', 'ai-product-photoshoot', 'ai-product-ads', 'ai_product_photoshoot_ads',
]);
const normalize = value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const slug = value => normalize(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const guidance = JSON.parse(fs.readFileSync(path.join(__dirname, '../knowledge/ai-product-photoshoot-ads/guidance.json'), 'utf8')).records;

function cleanPdfText(value) {
  return String(value).replace(/\r/g, '').replace(/\f/g, '\n')
    .split('\n').filter(line => !/^\s*SKILLOMATE\s+Chatbot Knowledge Base\s*$/.test(line)
      && !/^\s*AI Product Photoshoot & Ads\s*[·|]\s*Page\s+\d+\s*$/.test(line)).join('\n');
}

function parseProductKnowledge(text) {
  const clean = cleanPdfText(text);
  const digest = crypto.createHash('sha256').update(text).digest('hex');
  const parts = [...clean.matchAll(/^\s*Part ([A-G])\s*[—–-]\s*(.+)$/gm)];
  const byPart = new Map(parts.map((m, i) => [m[1], clean.slice(m.index + m[0].length, parts[i + 1]?.index ?? clean.length)]));
  const records = [];
  const add = (heading, content, contentType, lessonNumber = null, extra = {}) => {
    const body = normalize(content);
    if (!body) return;
    records.push({ heading, content: body, contentType, lessonNumber,
      lessonId: lessonNumber ? `lesson_${lessonNumber}` : '', lessonName: heading,
      chunkId: `ai-product-photoshoot-ads:training:${contentType}:${slug(heading)}`,
      contentHash: crypto.createHash('sha256').update(body).digest('hex'), sourceHash: digest,
      sourceDocument: 'training.txt', chunkStart: 0, ...extra });
  };
  // Policy text is not retrieved as a persona. The application owns response-language and safety rules.
  const overview = byPart.get('B') || '';
  add('Course overview and prerequisites', overview.split(/^\s*#\s+Lesson/m)[0], 'overview');
  const table = [...overview.matchAll(/^\s*(0[1-8])\s{2,}(.+?)(?:\n|$)([\s\S]*?)(?=^\s*0[1-8]\s{2,}|$(?![\s\S]))/gm)];
  for (const m of table) add(`Lesson ${m[1]} — ${normalize(m[2].split(/\s{2,}/)[0])}`, `${m[2]} ${m[3]}`, 'lesson-summary', Number(m[1]));
  const workflows = byPart.get('D') || '';
  const headings = [...workflows.matchAll(/^\s*([^\n•]+?)\s*\((L\d{2}(?:,\s*L\d{2})*)\)\s*$/gm)];
  for (let i = 0; i < headings.length; i++) {
    const m = headings[i];
    const lessons = [...m[2].matchAll(/L(\d+)/g)].map(x => Number(x[1]));
    add(normalize(m[1]), workflows.slice(m.index + m[0].length, headings[i + 1]?.index ?? workflows.length), 'workflow', lessons[0], { lessonNumbers: lessons });
  }
  // Each FAQ is its own source, rather than all FAQs sharing a PDF page header.
  for (const block of (byPart.get('E') || '').split(/\n\s*\n/)) {
    const content = normalize(block);
    if (!content || /^User ka sawaal/.test(content)) continue;
    const lesson = content.match(/\(L(\d{2})\)/)?.[1];
    const first = block.trim().split('\n')[0].trim().split(/\s{2,}/)[0];
    add(first, content, 'faq', lesson ? Number(lesson) : null);
  }
  const promptPart = byPart.get('F') || '';
  const templates = [...promptPart.matchAll(/^\s*(L\d{2}\s+[^\n]+)\s*$/gm)];
  for (let i = 0; i < templates.length; i++) {
    const m = templates[i];
    add(normalize(m[1]), promptPart.slice(m.index + m[0].length, templates[i + 1]?.index ?? promptPart.length), 'exact-template', Number(m[1].match(/L(\d+)/)[1]));
  }
  return records.map(record => {
    const localized = guidance.find(item => item.source_heading === record.heading);
    return localized ? { ...record, translations: localized.translations, searchTerms: localized.search_terms,
      intentTags: localized.intent_tags || [],
      exactInstructions: [...record.content.matchAll(/"([^"]+)"/g)].map(match => match[1]),
      translationHash: crypto.createHash('sha256').update(JSON.stringify(localized.translations)).digest('hex'),
      lessonNumber: record.lessonNumber || localized.lesson_number,
      lessonId: record.lessonId || (localized.lesson_number ? `lesson_${localized.lesson_number}` : '') } : record;
  });
}

const sourcePath = path.join(__dirname, '../knowledge/ai-product-photoshoot-ads/training.txt');
const PRODUCT_RECORDS = parseProductKnowledge(fs.readFileSync(sourcePath, 'utf8'));
const PRODUCT_TEMPLATES = PRODUCT_RECORDS.filter(record => record.contentType === 'exact-template');
if (PRODUCT_TEMPLATES.length !== 19 || new Set(PRODUCT_RECORDS.map(r => r.chunkId)).size !== PRODUCT_RECORDS.length) {
  throw new Error('Product knowledge integrity: expected 19 unique complete templates and unique record IDs');
}

function wantsProductPrompt(message) {
  return /\b(?:prompts?|templates?|wording|copy[- ]?paste)\b|प्रॉम्प्ट|प्रॉम्पट/i.test(message)
    && /\b(?:exact|copy|approved|give|send|likh|likhu|do|chahiye)\b|सटीक|सही|दो|दीजिए/i.test(message);
}

function templateQuery(value) {
  const aliases = { 'प्रोडक्ट शीट':'product sheet', 'रेफरेंस शीट':'product sheet', 'सफेद स्टूडियो':'white studio',
    'लाइफस्टाइल':'lifestyle', 'डार्क प्रीमियम':'dark premium', 'कैरेक्टर शीट':'character sheet',
    'हाथों का क्लोजअप':'hands close up', 'डेस्क':'desk', 'कैमरे को दिखाना':'showing to camera',
    'दिवाली':'diwali', 'वेडिंग गिफ्ट':'wedding gift', 'कलर वेरिएंट शीट':'colour variant sheet',
    'पुश-इन':'push in', 'लाइट स्वीप':'light sweep', 'आर्क':'arc', 'यूजीसी':'ugc',
    'लेसन':'lesson', 'पाठ':'lesson', 'स्टेप':'step', 'ब्रीफ':'brief', 'हुक्स':'hooks', 'स्क्रिप्ट':'script' };
  let result = normalize(value).toLowerCase();
  for (const [from,to] of Object.entries(aliases)) result = result.split(from).join(to);
  return result.replace(/[०-९]/g, c=>String(c.charCodeAt(0)-0x0966)).replace(/[-+]/g,' ');
}

function findProductTemplate(message, history = [], templates = PRODUCT_TEMPLATES) {
  const texts = [message, ...history.filter(t => t.role === 'user').slice(-4).reverse().map(t => t.content)];
  for (const text of texts) {
    const q = templateQuery(text);
    const requestedLesson = q.match(/\b(?:l|lesson\s*)0?(\d{1,2})\b/)?.[1];
    const ranked = templates.map(record => {
      const label = record.heading.replace(/^L\d+\s+/, '').toLowerCase().replace(/[-+]/g, ' ');
      const words = label.match(/[a-z0-9]+/g).filter(word => !['bonus', 'step'].includes(word));
      const matches = words.filter(w => new RegExp(`\\b${w}\\b`, 'i').test(q)).length;
      return { record, score: matches === words.length ? 20 + words.length : 0 };
    }).filter(x => x.score && (!requestedLesson || x.record.lessonNumber === Number(requestedLesson))).sort((a,b) => b.score-a.score);
    if (ranked.length && (ranked.length === 1 || ranked[0].score > ranked[1].score)) return ranked[0].record;
  }
  return null;
}

function cleanProductName(value) {
  const name = normalize(value).replace(/^(?:(?:a|an|the|my|our|this|that|same)\s+)+/i, '').trim();
  if (!name || name.length > 100 || /[\[\]{}<>\n]/.test(name)
    || /\b(?:it|that|this|changing|creating|making|same|me|course|prompt|template|ignore|system|developer|instead|mentioned|previous|above|discussed|earlier|features?|benefits?|angle|details|customer|them)\b/i.test(name)
    || /^(?:product|item|one|video|photo|ad|hooks?|scripts?|captions?)(?:\s|$)/i.test(name)) return '';
  return name;
}

function productSlots(message, history = [], previous = {}) {
  const values = {};
  if (cleanProductName(previous.product)) values.product = cleanProductName(previous.product);
  for (const key of ['part', 'colour', 'person']) if (typeof previous[key] === 'string') values[key] = normalize(previous[key]).slice(0, 100);
  const userTexts = [...history.filter(t => t.role === 'user').map(t => t.content), message];
  for (const text of userTexts) {
    // Explicit declarations beat request prepositions; referring phrases never replace a known entity.
    // Commas/clauses terminate the noun phrase, keeping instructions and prices out of the slot.
    const end = '(?=\\s+(?:(?:on|through|via|at|priced|with|using|and\\s+(?:I|we|write|give|preserve)|in\\s+(?:Lesson|English|Hindi|Hinglish))\\b|for\\s+(?:[₹$]|\\d))|[,;.!?।\\n]|$)';
    const noun = "([\\p{L}\\p{N}][\\p{L}\\p{N}\\p{M} '&/\\-]{0,100}?)";
    const declarations = [
      new RegExp('\\b(?:my product is|our product is|product name is)\\s+' + noun + end, 'iu'),
      new RegExp('\\b(?:I|we)\\s+(?:sell|have|use)\\s+' + noun + end, 'iu'),
      /\b(?:mera|meri)\s+product\s+([\p{L}\p{N}\p{M} '\-]{1,100}?)\s+hai\b/iu,
      /(?:मेरा|मेरी)\s+(?:प्रोडक्ट|उत्पाद)\s+([\p{L}\p{N}\p{M} '\-]{1,100}?)\s+है/u,
    ];
    const declared = declarations.map(pattern => String(text).match(pattern)).find(Boolean);
    const requested = /\b(?:prompts?|templates?|hooks?|scripts?|captions?|ad(?:\s+plan)?|product sheet|lifestyle|dark premium)\b/i.test(text)
      ? [...String(text).matchAll(new RegExp('\\b(?:for|of)\\s+' + noun + end, 'giu'))].map(m => m[1]) : [];
    const product = cleanProductName(declared?.[1] || '') || requested.map(cleanProductName).find(Boolean);
    if (product) values.product = product;
    // A modifier belongs to the request, not the colour: stop before punctuation
    // or a preservation clause. Keep noun determiners inside the approved slot.
    const variant = String(text).match(/\b(?:chang(?:e|ing)|recolou?r(?:ing)?)\s+(?:(?:the\s+)?colou?r\s+of\s+)?([\p{L}\p{N}][\p{L}\p{N}\p{M} '\-/]{0,79}?)\s+to\s+([\p{L}\p{N}][\p{L}\p{N}\p{M} '\-/]{0,59}?)(?=\s+(?:and|while|but)\s+(?:keep|preserv|leav|retain|do\s+not|don't)|[,;.!?।\n]|$)/iu);
    if (variant && /^[\p{L}\p{N} '\-]+$/u.test(variant[1]) && /^[\p{L}\p{N} '\-]+$/u.test(variant[2])) {
      const prefix=String(text).slice(0,variant.index);
      if (!/\b(?:do not|don't|never|not)\s*$/i.test(prefix)) {
        values.part = normalize(variant[1]); values.colour = normalize(variant[2]);
      }
    }
    const person = String(text).match(/\b(?:young Indian|adult|character|model|for a)\s+(woman|man)\b/i);
    if (person) values.person = person[1].toLowerCase();
  }
  return values;
}

function renderProductTemplate(template, values = {}) {
  let content = template.content;
  if (cleanProductName(values.product)) content = content.replace(/\[product\]/gi, () => cleanProductName(values.product));
  if (values.person) content = content.replace(/\[man\s*\/\s*woman\]/gi, values.person);
  if (values.part) content = content.replace(/\[the part, e\.g\. [^\]]+\]/g, () => values.part);
  if (values.colour) content = content.replace(/\[new colour, e\.g\. [^\]]+\]/g, () => values.colour);
  return content;
}

function productLessonNumber(text) {
  const value = templateQuery(text);
  return Number(value.match(/\b(?:lesson\s*|l)0?(\d{1,2})\b/)?.[1]) || null;
}

function requestedProductOutputs(message) {
  const text = String(message || '');
  if (!/\b(?:write|draft|create|generate|make|give|send|suggest|plan|prepare|now|next)\b|लिख|बनाओ|बनाइए|likho|banao/i.test(text)) return [];
  if (/\b(?:what|which|where|how|why)\b.*\b(?:provide|supply|need|find|available)\b/i.test(text)) return [];
  const outputs = [];
  for (const [kind, pattern] of Object.entries({ hooks:/\bhooks?\b|हुक/i, script:/\bscripts?\b|स्क्रिप्ट/i,
    caption:/\bcaptions?\b|कैप्शन/i, prompts:/\b(?:image|flow)\s+prompts?\b/i, angle:/\b(?:ad\s+)?angles?\b|विज्ञापन.*कोण/i })) if (pattern.test(text)) outputs.push(kind);
  if (/\b(?:use|choose|pick|selected)\s+(?:ad\s+)?angle\s*\d+\b/i.test(text)) {
    const index=outputs.indexOf('angle');if(index>=0)outputs.splice(index,1);
  }
  if (/\b(?:plan|make|create|prepare)\s+(?:(?:a|an|simple)\s+)*(?:product\s+)?ad\b|\bad plan\b/i.test(text)) outputs.push('plan');
  return [...new Set(outputs)];
}

function productFacts(message, history = [], previous = {}) {
  const facts = { ...productSlots('', [], previous), attributes: Array.isArray(previous.attributes) ? previous.attributes.filter(x=>typeof x==='string').slice(0,8) : [] };
  for (const key of ['price','channel','adAngle']) if (typeof previous[key] === 'string') facts[key] = previous[key].slice(0,180);
  for (const text of [...history.filter(t=>t.role==='user').map(t=>t.content), message]) {
    const slots=productSlots(text);
    if(slots.product && facts.product && slots.product.toLowerCase()!==facts.product.toLowerCase()) {
      for(const key of ['price','channel','adAngle','part','colour','person'])delete facts[key];
      facts.attributes=[];
    }
    Object.assign(facts,slots);
    const price = String(text).match(/(?:\b(?:price|cost|mrp)\s*(?:is|:|=)?\s*(?:₹|rs\.?\s*)?|₹\s*)(\d[\d,]*(?:\.\d{1,2})?)\b/i)
      || String(text).match(/\b(?:for|at)\s+(\d[\d,]*(?:\.\d{1,2})?)\s*(?:rupees|rs\b|₹)/i);
    if (price) facts.price = price[1];
    const channel = String(text).match(/\b(?:sell(?:ing)?\b.{0,100}?\b(?:on|through|via)|I sell on)\s+(?:(?:my|our|a|the)\s+)?(Instagram|website|marketplace|Amazon|Etsy|WhatsApp)\b/i)
      || String(text).match(/\b(?:sales channel|channel)\s*:\s*(Instagram|website|marketplace|Amazon|Etsy|WhatsApp)\b/i);
    if (channel) facts.channel = channel[1];
    const angle = String(text).match(/\b(?:use|choose|pick|selected)\s+(?:ad\s+)?angle\s*(?:is|:|=)?\s*([^.!?।\n]{1,100}?)(?=\s+(?:and|then)\s+(?:write|draft|give|make)|[.!?।\n]|$)/i);
    if (angle) facts.adAngle = normalize(angle[1]);
    for (const match of String(text).matchAll(/\b(?:colou?r|size|material|features?)\s*(?:is|are|:|=)\s*([^;.!?।\n]{1,100})/gi)) {
      if (!/\b(?:no|not|don't|without|unknown|invent|claim|ignore|system)\b|नहीं|मत|\?/.test(match[0]) && !String(text).includes('?')) facts.attributes.push(normalize(match[0]));
    }
  }
  facts.attributes = [...new Set(facts.attributes)].slice(-8);
  const latestOutputs = requestedProductOutputs(message);
  facts.requestedOutputs = latestOutputs.length ? latestOutputs : [];
  if (/^(?:now|next|continue|do that|same again|ab)\b/i.test(String(message).trim()) && latestOutputs.length===0) facts.requestedOutputs = previous.requestedOutputs || [];
  if (latestOutputs.includes('hooks') && !/\bonly\b/i.test(message) && (previous.requestedOutputs?.includes('plan') || history.some(t=>t.role==='user' && requestedProductOutputs(t.content).includes('plan')))) facts.requestedOutputs.push('script','caption');
  facts.requestedOutputs = [...new Set(facts.requestedOutputs)].slice(0,6);
  const context = productRequestContext(message, history, previous);
  facts.lessonNumber = context.lessonNumber;
  facts.topic = context.topic;
  return facts;
}

function productRequestContext(message, history = [], previous = {}) {
  const text = String(message || '');
  const priorUsers = history.filter(t=>t.role==='user').map(t=>t.content);
  const explicitLesson = productLessonNumber(text);
  const priorLesson = priorUsers.slice().reverse().map(productLessonNumber).find(Boolean) || previous.lessonNumber || null;
  const prior = priorUsers.slice(-2).join(' ');
  let topic = '', inferredLesson = null;
  if (/prerequis|before (?:starting|begin)|what (?:do I )?need.*(?:start|course)|ज़रूरत|शुरू.*चाहिए/i.test(text)) { topic='prerequisites'; inferredLesson=1; }
  else if (/prompts?.*(?:available|where|notes)|where.*prompts?|प्रॉम्प्ट.*(?:कहाँ|नोट्स)/i.test(text)) {topic='prompt_location';inferredLesson=8;}
  else if (/final.*(?:ad|workflow|order|edit)|finale|capcut|अंतिम|फाइनल/i.test(text)) {topic='final_assembly';inferredLesson=8;}
  else if (/(?:phone|handset|smartphone).{0,100}(?:visible|frame|on.?screen|appear|show|dikh)|(?:visible|appears?|show).{0,60}(?:phone|handset)|फोन.*(?:दिख|फ्रेम)/i.test(text)) {topic='phone_visibility';inferredLesson=7;}
  else if (/diwali|wedding|festiv|दिवाली|शादी|त्योहार/i.test(text)) {topic='festive';inferredLesson=4;}
  else if ((/colou?r|variant|shade|rang|रंग/i.test(text+' '+prior) || priorLesson===4) && /shape.{0,40}(?:chang|badal)|(?:chang|badal).{0,40}shape|आकार.{0,20}बदल/i.test(text)) {topic='colour_shape';inferredLesson=4;}
  else if (/brand.*(?:colou?r|shade)|(?:exact|precise).*(?:shade|colou?r)|रंग.*(?:मिल|सही)/i.test(text)) {topic='colour_shade';inferredLesson=4;}
  else if (/ugc|polished|handheld|commercial|studio ad|यूजीसी/i.test(text)) {topic=/polished|commercial|natural|studio/i.test(text)?'natural_ugc':'ugc';inferredLesson=7;}
  else if (/blur|letters|label|logo|small text|धुंध|अक्षर|dhundle/i.test(text)) {topic='blur';inferredLesson=/video|वीडियो/i.test(text+' '+prior)?6:2;}
  else if (/morph|warp|melt|pighal|movement|motion|मूवमेंट|आकार बदल/i.test(text)) {topic='motion';inferredLesson=6;}
  else if (/colou?r|variant|shade|rang|रंग/i.test(text)) {topic='colour';inferredLesson=4;}
  else if (/(?:face|chehra|चेहरा).{0,60}(?:chang|same|consistent|badal|बदल|समान)|(?:same|consistent).{0,20}face/i.test(text)) {topic='face_consistency';inferredLesson=3;}
  else if (/fingers?|ungli|उंगल/i.test(text)) {topic='hand_anatomy';inferredLesson=3;}
  else if (/character|face|hands|fingers|chehra|चेहरा|उंगल/i.test(text)) {topic='model_shot';inferredLesson=3;}
  else if (/lifestyle|dark premium|white studio/i.test(text)) {topic='product_photo';inferredLesson=2;}
  else if (/product sheet|phone photos|reference sheet|product (?:photo|image)|photo.*(?:different|same|consistent)|प्रोडक्ट शीट/i.test(text)) {topic='product_sheet';inferredLesson=2;}
  else if (/product[- ]videos?|video\s+(?:settings|workflow)|प्रोडक्ट.*वीडियो/i.test(text)) {topic='video';inferredLesson=6;}
  else if (requestedProductOutputs(text).length || /ad.*generic|product information|ad planning/i.test(text)) {topic='ad_plan';inferredLesson=5;}
  else if (/course.*(?:teach|cover|learn)|what (?:is|does|will).*course|कोर्स.*सिखा/i.test(text) && !explicitLesson) topic='overview';
  // Only referring/translation follow-ups inherit topic. An unrelated new question
  // must not be answered with a previous lesson just because a session exists.
  if (!topic && /\b(?:that|same|again|then|those|switch|wahi|in English|in Hindi|in Hinglish)\b|दोबारा|वही/i.test(text)) {
    const last=priorUsers.at(-1);
    const inherited=last ? productRequestContext(last, [], previous) : previous;
    topic=inherited.topic || '';
    inferredLesson=inherited.lessonNumber || null;
  }
  const lessonNumber = explicitLesson || inferredLesson || priorLesson;
  if (!topic && explicitLesson===8 && /workflow|steps|order/i.test(text)) topic='final_assembly';
  if (!topic && explicitLesson===1) topic='prerequisites';
  const exact = /\bexact|copy[- ]?paste|approved\b|सटीक/i.test(text);
  return { topic, lessonNumber, explicitLesson: Boolean(explicitLesson), exact,
    troubleshooting: /fix|troubleshoot|problem|wrong|morph|blur|stop|कैसा|कैसे रोक|ठीक|badal|pighal/i.test(text)
      || ['colour_shape','colour_shade','face_consistency','hand_anatomy','phone_visibility'].includes(topic)
      || topic==='motion' && !/settings|workflow|steps/i.test(text),
    procedural: /workflow|steps|settings|references|how (?:do|does|can|to)|तरीका|सेटिंग|kaise|tareeka/i.test(text),
    requestedOutputs: requestedProductOutputs(text) };
}

module.exports = { PRODUCT_SLUGS, PRODUCT_RECORDS, PRODUCT_TEMPLATES, cleanPdfText, parseProductKnowledge,
  wantsProductPrompt, findProductTemplate, productSlots, renderProductTemplate,
  cleanProductName, productFacts, productRequestContext, productLessonNumber, requestedProductOutputs };
