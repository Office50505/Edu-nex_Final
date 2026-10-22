const {extractEntity,extraSlots,scopeProductState,taskConstraints} = require('./productTutorState');
const { productIntentSignals, productResponseLanguage } = require('./productTutorIntent');
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
  const request=String(message||'').replace(/\b(?:not|without)\s+(?:(?:a|an|the|any)\s+)?(?:(?:saved|approved|exact)\s+)?(?:prompts?|templates?)\b/gi,'');
  // Locating saved prompts is a different task from copying their literal body.
  if (productIntentSignals(request).location && !/\b(?:copy|reproduce|verbatim)\b|सटीक.*(?:दीजिए|दो)/i.test(request)) return false;
  return /\b(?:prompts?|templates?|wording|copy[- ]?paste)\b|प्रॉम्प्ट|प्रॉम्पट/i.test(request)
    && /\b(?:exact|copy|approved|give|send|return|reproduce|complete|entire|original|likh|likhu|do|chahiye)\b|सटीक|सही|दो|दीजिए/i.test(request);
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
  const name = normalize(value).replace(/^(?:(?:a|an|the|my|our)\s+)+/i, '').trim();
  if (!name || name.length > 100 || /[\[\]{}<>\n]/.test(name)
    || /\b(?:it|that|this|changing|creating|making|same|me|course|prompt|template|ignore|system|developer|instead|mentioned|previous|above|discussed|earlier|features?|benefits?|angle|details|customer|them)\b/i.test(name)
    || /\b(?:not|no|given|provided|unknown|unset|unavailable)\b|अज्ञात/iu.test(name)
    || /^(?:(?:clearly )?adult |young Indian )?(?:man|woman|actor|presenter)$/i.test(name)
    || /^(?:product|item|one|video|photo|ad|hooks?|scripts?|captions?)(?:\s|$)/i.test(name)) return '';
  return name;
}

function productSlots(message, history = [], previous = {}) {
  const values = {};
  if (cleanProductName(previous.product)) values.product = cleanProductName(previous.product);
  for (const key of ['part', 'colour', 'person']) if (typeof previous[key] === 'string') values[key] = normalize(previous[key]).slice(0, 100);
  const userTexts = [...(previous.schemaVersion===2?[]:history).filter(t => t.role === 'user').map(t => t.content), message];
  for (const text of userTexts) {
    // Explicit declarations beat request prepositions; referring phrases never replace a known entity.
    // Commas/clauses terminate the noun phrase, keeping instructions and prices out of the slot.
    const end = '(?=\\s+(?:(?:on|through|via|at|priced|with|using|and\\s+(?:I|we|write|give|preserve|two|three|several|some|a pair)|in\\s+(?:Lesson|English|Hindi|Hinglish))\\b|for\\s+(?:[₹$]|\\d))|[,:;.!?।\\n]|$)';
    const noun = "([\\p{L}\\p{N}][\\p{L}\\p{N}\\p{M} '&/\\-]{0,100}?)";
    const declarations = [
      new RegExp('\\b(?:(?:my|our|the) (?:product|item) is (?:called|named)|the name of (?:my|our|the) product is)\\s+'+noun+end,'iu'),
      new RegExp('\\b(?:my product is|our product is|(?:my |the )?product(?: name)?\\s*(?:is|:)|I (?:only |just )?know (?:only |just )?the (?:product )?name(?: is)?|its name is)\\s*' + noun + end, 'iu'),
      new RegExp('\\b(?:I|we)\\s+(?:sell|have|use)\\s+' + noun + end, 'iu'),
      /\b(?:mujhe|humein)\s+(?:sirf\s+)?(?:product\s+ka\s+)?naam\s+([\p{L}\p{N}\p{M} '\-]{1,100}?)\s+(?:pata\s+hai|maloom\s+hai)\b/iu,
      /\b(?:mere|hamare)\s+product\s+ka\s+naam\s+([\p{L}\p{N}\p{M} '\-]{1,100}?)\s+hai\b/iu,
      /(?:मेरे|हमारे)\s+(?:प्रोडक्ट|उत्पाद)\s+का\s+नाम\s+([\p{L}\p{N}\p{M} '\-]{1,100}?)\s+है/u,
      /(?:मुझे|हमें)\s+(?:केवल|सिर्फ|बस)?\s*(?:(?:प्रोडक्ट|उत्पाद)\s+का\s+)?नाम\s+([\p{L}\p{N}\p{M} '\-]{1,100}?)\s+(?:पता|मालूम)\s+है/u,
      /\b(?:mera|meri)\s+product\s+([\p{L}\p{N}\p{M} '\-]{1,100}?)\s+hai\b/iu,
      /(?:मेरा|मेरी)\s+(?:प्रोडक्ट|उत्पाद)\s+([\p{L}\p{N}\p{M} '\-]{1,100}?)\s+है/u,
    ];
    const declared = declarations.map(pattern => String(text).match(pattern)).find(Boolean);
    const requested = /\b(?:prompts?|templates?|demo|demonstration|showcase|hooks?|scripts?|captions?|ad(?:\s+plan)?|product sheet|lifestyle|dark premium)\b/i.test(text)
      ? [...String(text).matchAll(new RegExp('(?=\\b(?:for|of)\\s+' + noun + end + ')', 'giu'))].map(m => m[1]) : [];
    const sceneSubject = /\b(?:compare|contrast)\b/i.test(text)
      ? String(text).match(new RegExp('\\baround\\s+'+noun+end,'iu'))?.[1] : '';
    const product = cleanProductName(extractEntity(text)?.product || '') || cleanProductName(declared?.[1] || '') || requested.map(cleanProductName).find(Boolean) || cleanProductName(sceneSubject);
    if (product) {
      if(values.product && product.toLowerCase()!==values.product.toLowerCase())for(const field of ['part','colour','person'])delete values[field];
      values.product = product;
    }
    // A modifier belongs to the request, not the colour: stop before punctuation
    // or a preservation clause. Keep noun determiners inside the approved slot.
    const variant = String(text).match(/\b(?:chang(?:e|ing)|recolou?r(?:ing)?)\s+(?:(?:the\s+)?colou?r\s+of\s+)?([\p{L}\p{N}][\p{L}\p{N}\p{M} '\-/]{0,79}?)\s+to\s+([\p{L}\p{N}][\p{L}\p{N}\p{M} '\-/]{0,59}?)(?=\s+(?:and|while|but)\s+(?:keep|preserv|leav|retain|do\s+not|don't)|[,;.!?।\n]|$)/iu);
    if (variant && /^[\p{L}\p{N} '\-]+$/u.test(variant[1]) && /^[\p{L}\p{N} '\-]+$/u.test(variant[2])) {
      const prefix=String(text).slice(0,variant.index);
      if (!/\b(?:do not|don't|never|not)\s*$/i.test(prefix)) {
        values.part = normalize(variant[1]); values.colour = normalize(variant[2]);
      }
    }
    for(const [key,value]of Object.entries(extraSlots(text)))if(['part','colour'].includes(key)&&value)values[key]=value;
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
  const asksMeaning=/\b(?:what (?:is|are)|(?:explain|learn about).{0,35}(?:hooks?|captions?|scripts?)|(?:hooks?|captions?|scripts?).{0,15}(?:mean|work))\b/i.test(text);
  if(asksMeaning&&!/\b(?:write|draft|create|generate|give|send|make|show|demonstrate)\b|\bdemonstration\s+do\b/i.test(text))return [];
  const composition=/\b(?:compare|contrast|difference|reason)\b/i.test(text)
    && /\b(?:empty|plain|simple|white)\b/i.test(text) && /\b(?:furnished|lifestyle|decorated)\b/i.test(text);
  if (!composition && !/\b(?:write|draft|create|generate|make|give|send|suggest|tell|show|demonstrate|plan|prepare|now|next|chahiye|batao)\b|\b(?:could|would|can)\s+(?:you|I)\b|\b(?:I would|I'd)\s+like\b|\bI need\b|\bdemonstration\s+do\b|लिख|बनाओ|बनाइए|दीजिए|बताइए|चाहिए|likh(?:o|\s+do)|banao|\bidea\s+do\b/i.test(text)) return [];
  if (/\b(?:what|which|where|how|why)\b.*\b(?:provide|supply|need|find|available)\b/i.test(text)) return [];
  const outputs = [];
  if(composition)outputs.push('composition');
  if (/\b(?:demo|demonstration|showcase)\b|डेमो|प्रदर्शन/iu.test(text)
    && /\b(?:idea|example|concrete|show|demonstrate|write|give|draft|create|suggest|make|dikhaye|dikhao|do)\b|उदाहरण|दिखा|बनाइए/i.test(text))outputs.push('demo');
  for (const [kind, pattern] of Object.entries({ hooks:/\bhooks?\b|हुक/i, script:/\bscripts?\b|स्क्रिप्ट/i,
    caption:/\bcaptions?\b|कैप्शन/i, prompts:/\b(?:image|flow)\s+prompts?\b/i, angle:/\b(?:ad\s+)?angles?\b|विज्ञापन.*कोण/i })) if (pattern.test(text)) outputs.push(kind);
  if (/\b(?:use|choose|pick|selected)\s+(?:ad\s+)?angle\s*\d+\b/i.test(text)) {
    const index=outputs.indexOf('angle');if(index>=0)outputs.splice(index,1);
  }
  if (/\b(?:buyers?|buyer groups?|types of people)\b/i.test(text)&&outputs.includes('angle'))outputs.push('plan');
  if (/\b(?:plan|make|create|prepare)\s+(?:(?:a|an|simple)\s+)*(?:product\s+)?ad\b|\bad plan\b/i.test(text)) outputs.push('plan');
  return [...new Set(outputs)];
}

function productFacts(message, history = [], previous = {}, scope = {}) {
  previous=scopeProductState(previous,scope);
  const factHistory=previous.schemaVersion===2?[]:history;

  const facts = { ...productSlots('', [], previous), attributes: Array.isArray(previous.attributes) ? previous.attributes.filter(x=>typeof x==='string').slice(0,8) : [] };
  for (const key of ['price','channel','adAngle']) if (typeof previous[key] === 'string') facts[key] = previous[key].slice(0,180);
  for (const text of [...factHistory.filter(t=>t.role==='user').map(t=>t.content), message]) {
    const slots=productSlots(text);
    if(slots.product && facts.product && slots.product.toLowerCase()!==facts.product.toLowerCase()) {
      for(const key of ['price','channel','adAngle','part','colour','person'])delete facts[key];
      facts.attributes=[];
    }
    Object.assign(facts,slots);
    const price = String(text).match(/(?:\b(?:price|cost|mrp)\s*(?:is|:|=)?\s*(?:₹|rs\.?\s*)?|₹\s*)(\d[\d,]*(?:\.\d{1,2})?)\b/i)
      || String(text).match(/\b(?:for|at)\s+(\d[\d,]*(?:\.\d{1,2})?)\s*(?:rupees|rs\b|₹)/i);
    if (price) facts.price = price[1];
    for(const [key,value]of Object.entries(extraSlots(text))){if(value===null)delete facts[key];else facts[key]=value;}
    const channel = String(text).match(/\b(?:sell(?:ing)?\b.{0,100}?\b(?:on|through|via)|I sell on)\s+(?:(?:my|our|a|the)\s+)?(Instagram|website|marketplace|Amazon|Etsy|WhatsApp)\b/i)
      || String(text).match(/\b(?:sales channel|channel)\s*:\s*(Instagram|website|marketplace|Amazon|Etsy|WhatsApp)\b/i);
    if (channel) facts.channel = channel[1];
    const angle = String(text).match(/\b(?:use|choose|pick|selected)\s+(?:ad\s+)?angle\s*(?:is|:|=)?\s*([^.!?।\n]{1,100}?)(?=\s+(?:and|then)\s+(?:write|draft|give|make)|[.!?।\n]|$)/i);
    if (angle) {
      const selected=angle[1].match(/^([1-5])(?:\b|$)/)?.[1];
      const option=previous.adAngles?.find(o=>o.id===selected);
      facts.adAngle=option?.text || selected || normalize(angle[1]);
    }
    for (const match of String(text).matchAll(/\b(?:colou?r|size|material|features?)\s*(?:is|are|:|=)\s*([^;.!?।\n]{1,100})/gi)) {
      if (!/\b(?:no|not|don't|without|unknown|invent|claim|ignore|system)\b|नहीं|मत|\?/.test(match[0]) && !String(text).includes('?')) facts.attributes.push(normalize(match[0]));
    }
  }
  facts.attributes = [...new Set(facts.attributes)].slice(-8);
  const latestOutputs = requestedProductOutputs(message);
  facts.requestedOutputs = latestOutputs.length ? latestOutputs : [];
  if (/^(?:now|next|continue|do that|same again|ab)[.!?\s]*$/i.test(String(message).trim()) && latestOutputs.length===0) facts.requestedOutputs = previous.requestedOutputs || [];
  if (latestOutputs.includes('hooks') && !/\bonly\b/i.test(message) && (previous.requestedOutputs?.includes('plan') || history.some(t=>t.role==='user' && requestedProductOutputs(t.content).includes('plan')))) facts.requestedOutputs.push('script','caption');
  facts.requestedOutputs = [...new Set(facts.requestedOutputs)].slice(0,6);
  const context = productRequestContext(message, history, previous);
  facts.lessonNumber = context.lessonNumber;
  facts.topic = context.topic;
  facts.language = productResponseLanguage(message,history,previous);
  facts.schemaVersion=2;
  facts.courseId=scope.courseId||previous.courseId||'';facts.conversationId=scope.conversationId||previous.conversationId||'';
  facts.currentTask={outputs:facts.requestedOutputs,parts:context.tasks||[],request:/^(?:again|continue|same again|do that|repeat|next)[.!?\s]*$/i.test(String(message).trim())?previous.currentTask?.request||'':String(message).slice(0,500),...taskConstraints(message,previous.currentTask)};
  facts.adAngles=facts.product===previous.product?(previous.adAngles||[]):[];
  facts.evidence={...(facts.product===previous.product?previous.evidence:{} )};
  for(const field of ['product','part','colour','person','price','channel'])if(facts[field]!==previous[field]&&facts[field])facts.evidence[field]=String(message).slice(0,500);
  return facts;
}

function productRequestContext(message, history = [], previous = {}) {
  // The title names this course; it is not a lesson-task signal.
  const text = String(message || '').replace(/\bAI\s+Product\s+Photoshoot\s*(?:&|and)\s*Ads\b/gi,'course');
  const priorUsers = history.filter(t=>t.role==='user').map(t=>t.content);
  const explicitLesson = productLessonNumber(text);
  const priorLesson = priorUsers.slice().reverse().map(productLessonNumber).find(Boolean) || previous.lessonNumber || null;
  const prior = priorUsers.slice(-2).join(' ');
  const outputs=requestedProductOutputs(message);
  const signals=productIntentSignals(text);
  const wholeCourse=/\b(?:whole|entire|complete|full)\s+course\b|\b(?:overview|syllabus|curriculum|learning outcomes)\b|पूर[ेा]\s+कोर्स|poore?\s+course/i.test(text);
  const overview=!explicitLesson && /\bcourse\b|कोर्स/i.test(text)
    && (wholeCourse || /\bcourse\b.{0,25}\b(?:teach|cover|include|learn)\w*\b|\bwhat\b.{0,35}\blearn\b|कोर्स.*(?:सिखा|सीख)|course.*(?:sikh|seekh)/i.test(text))
    && (wholeCourse || !/\b(?:fix|settings|workflow|prompt|template)\b/i.test(text));
  let topic = '', inferredLesson = null;
  if(/\b(?:active course|which course|what course|are we studying|is (?:this|our).{0,30}course)\b|कौन सा कोर्स/i.test(text)){topic='course_identity';}
  else if(overview){topic='overview';inferredLesson=1;}
  else if (/prerequis|before (?:starting|begin)|what (?:do I )?need.*(?:start|course)|ज़रूरत|शुरू.*चाहिए/i.test(text)) { topic='prerequisites'; inferredLesson=1; }
  else if (signals.location && !signals.compound) {topic='prompt_location';inferredLesson=8;}
  else if (/final\s+(?:(?:ad|project)\s+)?(?:workflow|order|assembly|edit)|finale|capcut|अंतिम|फाइनल/i.test(text)) {topic='final_assembly';inferredLesson=8;}
  else if (/\b(?:phone|handset|smartphone|mobile(?: device)?)\b.{0,100}\b(?:visible|frame|on.?screen|appear\w*|show\w*|dikh\w*|enters?|nazar|pok\w*|intrud\w*|protrud\w*)\b|\b(?:visible|appear\w*|show\w*|frame)\b.{0,60}\b(?:phone|handset|mobile(?: device)?)\b|(?:फोन|मोबाइल).*(?:दिख|फ्रेम|नज़र|नजर)/i.test(text)) {topic='phone_visibility';inferredLesson=7;}
  else if(outputs.includes('composition')){topic='composition';inferredLesson=2;}
  else if(outputs.includes('demo')){topic='ugc';inferredLesson=7;}
  else if(explicitLesson===7 && /settings|references|सेटिंग|संदर्भ/i.test(text)){topic='ugc';inferredLesson=7;}
  else if (/diwali|wedding|festiv|दिवाली|शादी|त्योहार/i.test(text)) {topic='festive';inferredLesson=4;}
  else if ((signals.colourAction || previous.topic==='colour' || previous.topic==='colour_shape' || (priorLesson===4&&/recolou?r|variants?|rang.*badal|रंग.*बदल/i.test(prior))) && /shape.{0,55}(?:chang|badal|recolou?r)|(?:chang|badal|different).{0,40}shape|आकार.{0,20}बदल/i.test(text)) {topic='colour_shape';inferredLesson=4;}
  else if (/brand.*(?:colou?r|shade)|(?:exact|precise).*(?:shade|colou?r)|रंग.*(?:मिल|सही)/i.test(text)) {topic='colour_shade';inferredLesson=4;}
  else if (/\b(?:ugc|handheld)\b|\b(?:polished|commercial|studio)\s+(?:looking\s+|style\s+)?(?:ad|video|clip|footage)\b|\b(?:ad|video|clip|footage)\s+(?:(?:looks?|feels?|is|seems?|too|very|so|a|like)\s+){1,5}(?:polished|commercial|studio)\b|यूजीसी/i.test(text)) {topic=/\b(?:polished|commercial|natural|studio)\b/i.test(text)?'natural_ugc':'ugc';inferredLesson=7;}
  else if (/\b(?:blur\w*|letters?|lettering|labels?|logos?|small text)\b|धुंध|अक्षर|dhundle/i.test(text)) {topic='blur';inferredLesson=/\bvideo\b|वीडियो/i.test(text+' '+prior)?6:2;}
  else if (/\b(?:morph\w*|warp\w*|melt\w*|pighal\w*|movements?|motion)\b|मूवमेंट|आकार बदल/i.test(text)) {topic='motion';inferredLesson=6;}
  else if (signals.colourAction) {topic='colour';inferredLesson=4;}
  else if (/(?:face|chehra|चेहरा).{0,60}(?:chang|same|consistent|badal|बदल|समान)|(?:same|consistent).{0,20}face/i.test(text)) {topic='face_consistency';inferredLesson=3;}
  else if (/fingers?|ungli|उंगल/i.test(text)) {topic='hand_anatomy';inferredLesson=3;}
  else if (/\b(?:characters?|faces?|hands|fingers|chehra)\b|चेहरा|उंगल/i.test(text)) {topic='model_shot';inferredLesson=3;}
  else if (/lifestyle|dark premium|white studio/i.test(text)) {topic='product_photo';inferredLesson=2;}
  else if (/\b(?:product|item|object)\b.{0,50}\b(?:changes?|different|inconsistent)\b.{0,50}\b(?:photos?|images?|shots?)\b|\b(?:photos?|images?|shots?)\b.{0,50}\b(?:different|inconsistent)\b|(?:फोटो|तस्वीर).{0,45}(?:अलग|बदल)|\b(?:photos?|images?)\b.{0,45}\b(?:alag|badal)\w*/i.test(text)) {topic='product_consistency';inferredLesson=2;}
  else if (/\b(?:product sheets?|phone photos?|reference sheets?|product (?:photos?|images?))\b|\bphoto\b.*\b(?:different|same|consistent)\b|प्रोडक्ट शीट/i.test(text)) {topic='product_sheet';inferredLesson=2;}
  else if (/product[- ]videos?|video\s+(?:settings|workflow)|प्रोडक्ट.*वीडियो/i.test(text) || explicitLesson===6 && /settings|references|सेटिंग/i.test(text)) {topic='video';inferredLesson=6;}
  else if (outputs.length || /\bgeneric\b.{0,45}\bad\b|\bad\b.{0,45}generic|product information|ad planning/i.test(text)) {topic='ad_plan';inferredLesson=5;}
  const referring=/\b(?:this|it|that|same|again|then|those|switch|instead|alternative|next|wahi|in English|in Hindi|in Hinglish)\b|दोबारा|वही/i.test(text);
  const inheritsLesson=!topic && referring && !explicitLesson && Boolean(priorLesson || previous.lessonNumber);
  // Only referring/translation follow-ups inherit topic. An unrelated new question
  // must not be answered with a previous lesson just because a session exists.
  if (!topic && referring) {
    const last=priorUsers.at(-1);
    const inherited=last ? productRequestContext(last, [], previous) : previous;
    topic=inherited.topic || previous.topic || '';
    inferredLesson=inherited.lessonNumber || previous.lessonNumber || priorLesson || null;
  }
  const lessonNumber = explicitLesson || inferredLesson || (referring ? priorLesson : null);
  if (!topic && explicitLesson===8 && /workflow|steps|order/i.test(text)) topic='final_assembly';
  if (!topic && explicitLesson===1) topic='prerequisites';
  const exact = /\bexact|copy[- ]?paste|approved\b|सटीक/i.test(text);
  return { topic, lessonNumber, explicitLesson: Boolean(explicitLesson), exact, carryLesson:inheritsLesson, compound:signals.compound, openReasoning:signals.reasoning, wholeJourney:signals.wholeJourney,
    troubleshooting: /fix|troubleshoot|problem|wrong|morph|blur|stop|कैसा|कैसे रोक|ठीक|badal|pighal/i.test(text)
      || ['colour_shape','colour_shade','face_consistency','hand_anatomy','phone_visibility','product_consistency'].includes(topic)
      || topic==='motion' && !/settings|workflow|steps/i.test(text),
    procedural: /workflow|steps|settings|references|how (?:do|does|can|to)|तरीका|कदम|शुरुआत|सेटिंग|kaise|tareeka/i.test(text),
    requestedOutputs: requestedProductOutputs(text), previousTask:previous.currentTask?.request, tasks:signals.tasks, lessons:signals.lessons };
}

module.exports = { PRODUCT_SLUGS, PRODUCT_RECORDS, PRODUCT_TEMPLATES, cleanPdfText, parseProductKnowledge,
  wantsProductPrompt, findProductTemplate, productSlots, renderProductTemplate,
  cleanProductName, productFacts, productRequestContext, productLessonNumber, requestedProductOutputs };
