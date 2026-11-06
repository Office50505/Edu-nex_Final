const {entity,productOperations,extractEntity,extraSlots,scopeProductState,taskConstraints,maskProductOperations,productNameSecurityText} = require('./productTutorState');
const { productCopyIntent, productIntentSignals, productResponseLanguage } = require('./productTutorIntent');
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
  const intent=productCopyIntent(message),{request}=intent;
  if(intent.generation || intent.educational&&!intent.copyAction)return false;
  if(productIntentSignals(request).location&&!/\b(?:copy|reproduce|verbatim)\b|सटीक.*(?:दीजिए|दो)/i.test(request))return false;
  const named=findProductTemplate(request);
  if(named&&intent.copyAction&&(intent.sourceCopy||intent.complete))return true;
  if(named&&intent.complete&&intent.sourceCopy&&!intent.educational)return true;
  return /\b(?:prompts?|templates?|wording|copy[- ]?paste)\b|प्रॉम्प्ट|प्रॉम्पट/i.test(request)
    && /\b(?:exact|copy|approved|give|send|return|reproduce|complete|entire|likh|likhu|do|chahiye)\b|सटीक|सही|दो|दीजिए/i.test(request);
}

function wantsProductScene(message) {
  const intent=productCopyIntent(message);
  // A direct request to make a named course scene may use its saved reference.
  // Mentioning that scene in an explanation or an original draft is not enough.
  return !intent.educational&&!intent.generation
    && /\b(?:make|create|generate)\b/i.test(intent.request)
    && /white studio|lifestyle|dark premium/i.test(intent.request);
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

function cleanProductName(value) { return entity(value); }

const TEMPLATE_SLOTS=Object.freeze({
 'product':'product','man / woman':'person','woman / man':'person','woman':'person',
 "woman's":'possessive','She':'subjectPronoun','her':'objectPronoun',
 'hair, outfit details':'appearance',
 'clothing that matches the character sheet, e.g. bare arms matching her blue tank top':'clothing',
 'the part, e.g. all the keycaps':'part','new colour, e.g. soft pastel pink':'colour',
 'product with real details — size, colour, key features':'details','your price':'price',
 'Instagram / website / marketplace':'channel','number':'number',
 'your hook line in Hindi':'hookLine','your second line in Hindi':'secondLine',
});
function suppliedSlot(value){
 const raw=String(value||'').trim().replace(/^["“‘]|["”’]$/gu,'');
 const checked=productNameSecurityText(raw);
 return raw&&checked&&raw.length<=400&&!/[<>\[\]{}]/u.test(checked)&&! /\b(?:ignore|system|developer)\b/iu.test(checked)?raw:'';
}
function explicitTemplateSlots(text){
 const q=String(text||''),values={};
 const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const readValue=(at,key)=>{
  let tail=q.slice(at).trimStart(),value;
  const quoted=tail.match(/^["“]([^"”]+)["”]/u);
  if(quoted)value=quoted[1];
  else{
   value=tail.split(/[;\n]|\.(?=\s|$)/u)[0]
    .split(/,?\s+(?:and|aur)\s+(?=\[|(?:the\s+)?clothing\s+(?:slot\s*)?[:=])/iu)[0]
    .split(/,\s*(?=\[)/u)[0]
    .split(/\s+(?:throughout|only|and\s+(?:retain|preserve|keep|leave)|bharo|लिखें|लिखिए|से\s+बदलें|से\s+भरें|se\s+replace)/iu)[0]
    .split(/\s+Keep\s+(?:the\s+)?rest\b/iu)[0];
  }
  value=suppliedSlot(value);return key==='product'?entity(value):value;
 };
 for(const [label,key]of Object.entries(TEMPLATE_SLOTS)){
  const target='\\['+escape(label)+'\\]';
  const assignments=[new RegExp(target+'\\s*(?:=|:|with\\s+|ko\\s+|को\\s+|की जगह\\s+)','iu')];
  const m=assignments.map(p=>q.match(p)).find(Boolean);
  if(m){const value=readValue(m.index+m[0].length,key);if(value)values[key]=value;}
  if(!values[key]){
   const swap=q.match(new RegExp('substitut(?:e|ing)\\s+(.+?)\\s+for\\s+'+target,'iu'));
   if(swap){const value=key==='product'?entity(swap[1]):suppliedSlot(swap[1]);if(value)values[key]=value;}
  }
 }
 const labels={details:'product details',appearance:'hair(?:,| and) outfit details',clothing:'(?:the )?clothing(?: slot)?',price:'price',channel:'(?:sales )?channel',number:'(?:number|hook count)',person:'character'};
 for(const [key,label]of Object.entries(labels)){
  const m=q.match(new RegExp('(?:^|[.:;\\n]\\s*|\\band\\s+)'+label+'\\s*[:=]\\s*','iu'));
  if(m){const value=readValue(m.index+m[0].length,key);if(value)values[key]=value;}
 }
 return values;
}

function productSlots(message, history = [], previous = {}) {
 const values={};
 if(entity(previous.product))values.product=entity(previous.product);
 for(const key of new Set(Object.values(TEMPLATE_SLOTS)))if(key!=='product'&&typeof previous[key]==='string'&&suppliedSlot(previous[key]))values[key]=previous[key];
 for(const a of previous.attributes||[]){const m=a.match(/^Template field ([a-zA-Z]+): (.+)$/);if(m&&Object.values(TEMPLATE_SLOTS).includes(m[1]))values[m[1]]=suppliedSlot(m[2]);}
 const userTexts=[...(previous.schemaVersion===2?[]:history).filter(t=>t.role==='user').map(t=>t.content),message];
 for(const text of userTexts){
  const ops=productOperations(text).filter(o=>!o.negated);
  for(const op of ops){
   if(op.type==='reset'||op.type==='replace'&&!op.unsafe){for(const k of Object.keys(values))delete values[k];}
   if(['replace','rename'].includes(op.type)&&op.product)values.product=op.product;
  }
  const declared=extractEntity(text),assigned=explicitTemplateSlots(text);
  const product=entity(assigned.product)||declared?.product;
  if(product){if(values.product&&product!==values.product)for(const k of Object.keys(values))delete values[k];values.product=product;}
  Object.assign(values,assigned);
  for(const [key,value]of Object.entries(extraSlots(text)))if(['part','colour','price','channel'].includes(key)&&value&&!assigned[key])values[key]=value;
  const person=String(text).match(/\b(?:(?:young Indian|adult|character|model)\s+|for\s+(?:(?:an?|the)\s+)?(?:adult\s+)?)(woman|man)\b/i);
  if(person)values.person=person[1].toLowerCase();
 }
 return values;
}
function renderProductTemplate(template, values = {}, options = {}) {
 if(options.raw)return template.content;
 return template.content.replace(/\[([^\]]+)\]/g,(original,label)=>{
  if(options.allowedSlots&&!options.allowedSlots.some(s=>s.toLowerCase()===label.toLowerCase()))return original;
  const key=TEMPLATE_SLOTS[label]||(/^[Pp][Rr][Oo][Dd][Uu][Cc][Tt]$/.test(label)?'product':null);
  if(!key)return original;
  let value=key==='product'?entity(values.product):suppliedSlot(values[key]);
  // Pronouns follow only an explicitly supplied character, never an inferred sex.
  if(!value&&/^(?:possessive|subjectPronoun|objectPronoun)$/.test(key)&&/^(?:man|woman)$/.test(values.person||'')){
   value=key==='possessive'?values.person+"'s":key==='subjectPronoun'?(values.person==='woman'?'She':'He'):(values.person==='woman'?'her':'his');
  }
  return value||original;
 });
}

function productLessonNumber(text) {
  const value = templateQuery(text);
  return Number(value.match(/\b(?:lesson\s*|l)0?(\d{1,2})\b/)?.[1]) || null;
}

function requestedProductOutputs(message) {
  const text = String(message || '').split(/[.;!?।\n]/u).filter(c=>!/\b(?:do not|don't|never)\s+(?:write|generate|give|draft)\b/iu.test(c)).join('. ');
  const asksMeaning=/\b(?:what (?:is|are)|(?:explain|learn about).{0,35}(?:hooks?|captions?|scripts?)|(?:hooks?|captions?|scripts?).{0,15}(?:mean|work))\b/i.test(text);
  if(asksMeaning&&!/\b(?:write|draft|create|generate|give|send|make|show|demonstrate)\b|\bdemonstration\s+do\b/i.test(text))return [];
  const composition=/\b(?:compare|contrast|difference|reason)\b/i.test(text)
    && /\b(?:empty|plain|simple|white)\b/i.test(text) && /\b(?:furnished|lifestyle|decorated)\b/i.test(text);
  if (/\b(?:what comes after|farq|difference|explain|samjhao)\b|फर्क|फ़र्क|तुलना/i.test(text)&&! /\b(?:write|draft|create|generate|make|banao|likho)\b|\b(?:give|send)\b.{0,40}\b(?:caption|hooks?|script|demo|brief)\b|लिख|बनाइए/i.test(text))return [];
  if (!composition && !/\b(?:write|draft|create|generate|make|give|send|suggest|tell|show|demonstrate|plan|prepare|now|next|chahiye|batao)\b|\b(?:could|would|can)\s+(?:you|I)\b|\b(?:I would|I'd)\s+like\b|\bI need\b|\b(?:demonstration|dialogue|explanation)\b.{0,60}\bdo\b|लिख|बनाओ|बनाइए|दीजिए|दें|बताइए|चाहिए|likh(?:o|\s+do)|banao|\bidea\s+do\b/i.test(text)) return [];
  if (/\b(?:what|which|where|how|why)\b.*\b(?:provide|supply|need|find|available)\b/i.test(text)) return [];
  const outputs = [];
  if(composition)outputs.push('composition');
  if (/\b(?:demo|demonstration|showcase)\b|डेमो|प्रदर्शन/iu.test(text)
    && /\b(?:idea|example|concrete|show|demonstrate|write|give|draft|create|suggest|make|dikhaye|dikhao|do)\b|उदाहरण|दिखा|बनाइए/i.test(text))outputs.push('demo');
  for (const [kind, pattern] of Object.entries({ hooks:/\bhooks?\b|हुक/i, script:/\bscripts?\b|स्क्रिप्ट/i,
    caption:/\bcaptions?\b|कैप्शन/i, prompts:/\b(?:image|flow)\s+prompts?\b/i, angle:/(?<!camera )\b(?:ad\s+)?angles?\b|विज्ञापन.*कोण/i })) if (pattern.test(text)) outputs.push(kind);
  if (/\b(?:use|choose|pick|selected)\s+(?:ad\s+)?angle\s*\d+\b/i.test(text)) {
    const index=outputs.indexOf('angle');if(index>=0)outputs.splice(index,1);
  }
  if (/\b(?:buyers?|buyer groups?|types of people)\b/i.test(text)&&outputs.includes('angle'))outputs.push('plan');
  if (/\b(?:plan|make|create|prepare)\s+(?:(?:a|an|simple)\s+)*(?:product\s+)?ad\b|\bad plan\b/i.test(text)) outputs.push('plan');
  if(/\bcards?\b/i.test(text))outputs.push('cards');
  for(const [kind,pattern]of Object.entries({scene:/\b(?:give|suggest|create|make|draft|write)\b.{0,60}\b(?:lifestyle|dark premium|white studio|original|new|custom)?\s*(?:scene|setup)\b|\bactual(?:\s+English|\s+Hindi|\s+Hinglish)?\s+prompt\b|\b(?:scene|setting)\s+(?:prompt|description)|\b(?:original|custom)\b.{0,50}\b(?:image prompt|scene)|सीन.*प्रॉम्प्ट/i,dialogue:/\b(?:dialogue|spoken line)\b|संवाद/i,brief:/\b(?:buyer brief|product brief|ad brief|(?:a|the|one)\s+(?:short\s+)?brief)\b/i}))if(pattern.test(text)&&!(kind==='dialogue'&&outputs.includes('demo')))outputs.push(kind);
  return [...new Set(outputs)].filter(kind=>!new RegExp("(?:do not|don't|no)\\s+(?:write\\s+|generate\\s+|give\\s+)?"+kind+'\\b','i').test(text));
}

function productFacts(message, history = [], previous = {}, scope = {}) {
  previous=scopeProductState(previous,scope);
  const factHistory=previous.schemaVersion===2?[]:history;

  const facts = { ...productSlots('', [], previous), attributes: Array.isArray(previous.attributes) ? previous.attributes.filter(x=>typeof x==='string').slice(0,8) : [] };
  for (const key of ['price','channel','adAngle']) if (typeof previous[key] === 'string') facts[key] = previous[key].slice(0,180);
  for (const rawText of [...factHistory.filter(t=>t.role==='user').map(t=>t.content), message]) {
    const operations=productOperations(rawText).filter(op=>!op.negated);
    const boundary=operations.filter(op=>op.type==='reset'||op.type==='replace'&&!op.unsafe).at(-1);
    const text=boundary?String(rawText).slice(boundary.span[0]):rawText;
    const reset=operations.some(op=>op.type==='reset'||op.type==='replace'&&!op.unsafe);
    if(reset){for(const key of Object.keys(facts))delete facts[key];facts.attributes=[];}
    const slots=productSlots(text);
    if(slots.product && facts.product && slots.product!==facts.product && !operations.some(op=>op.type==='rename')) {
      for(const key of ['price','channel','adAngle','part','colour','person'])delete facts[key];
      facts.attributes=[];
    }
    Object.assign(facts,slots);
    for(const key of ['appearance','clothing','possessive','subjectPronoun','objectPronoun','details','number','hookLine','secondLine'])if(slots[key]){facts.attributes=facts.attributes.filter(a=>!a.startsWith('Template field '+key+': '));facts.attributes.push('Template field '+key+': '+slots[key]);}
    const price = String(text).match(/(?:\b(?:price|cost|mrp)\s*(?:is|:|=)?\s*(?:₹|rs\.?\s*)?|₹\s*)(\d[\d,]*(?:\.\d{1,2})?)\b/i)
      || String(text).match(/\b(?:for|at)\s+(\d[\d,]*(?:\.\d{1,2})?)\s*(?:rupees|rs\b|₹)/i);
    if (price) facts.price = price[1].replace(/,+$/,'');
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
    for(const match of String(text).matchAll(/\b(colou?r|size|material|features?)\s*(?:is|are|:|=)\s*([^;.!?।\n]{1,100})/gi)){
      if(/\b(?:unknown|invent|claim|ignore|system)\b|अज्ञात|\?/.test(match[0]))continue;
      const field=match[1].toLowerCase().replace('color','colour');
      facts.attributes=facts.attributes.filter(a=>!new RegExp('^'+field+'\\b','i').test(a));
      facts.attributes.push(String(match[0]).replace(/\s+/g,' ').trim());
    }
    const description=String(text).match(/["”’]\s*,\s*(?:an?\s+)([^;.!?।\n]{2,90})|["”’]\s+is\s+(?:my|our)\s+([^;.!?।\n]{2,90})/u);
    if(description)facts.attributes.push((description[1]||description[2]).trim());
    if(slots.product&&!operations.some(o=>o.type==='replace'||o.type==='rename')){
      const quoted=String(text).match(/^[\s]*(?:My |Our |I sell )?["“‘][^"”’]+["”’]\s+([^;.!?।\n]{1,160})/iu);
      if(quoted){for(const part of quoted[1].split(/,|\bwith\b/iu)){const value=part.replace(/^(?:is|means)\s+(?:my|our|a|an)\s+|^(?:mera|meri|मेरा|मेरी)\s+/iu,'').replace(/\s+(?:hai|है)$/iu,'').trim();if(value&&!/[₹$]|\b(?:sold|costs?|price|on Instagram|on Etsy)\b/i.test(value))facts.attributes.push(value);}}
    }
    const correction=String(text).match(/\bCorrection:\s*(?:it\s+)?has\s+([^;.!?।\n]+?)(?=\s+and\s+costs?|[;.!?।\n]|$)/iu);
    if(correction){const last=correction[1].trim().split(/\s+/).at(-1);facts.attributes=facts.attributes.filter(a=>!new RegExp('\\b'+last.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','iu').test(a));facts.attributes.push(correction[1].trim());}
    for(const match of String(text).matchAll(/(?:^|[.;।]\s*)(No [^;.!?।\n]{2,100}|Do not (?:claim|invent|add) [^;.!?।\n]{2,100})/gi))facts.attributes.push(match[1].trim());
  }
  for(const [label,key]of Object.entries({'सामग्री':'material','रंग':'colour','आकार':'size'})){
    const m=String(message).match(new RegExp(label+'\\s*[:=]\\s*([^;.!?।\\n]{1,100})','iu'));
    if(m){facts.attributes=facts.attributes.filter(a=>!new RegExp('^(?:'+label+'|'+key+')\\b','iu').test(a));facts.attributes.push(key+': '+m[1].trim());}
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
  facts.currentTask={outputs:facts.requestedOutputs,parts:context.tasks||[],request:/^(?:again|continue|same again|do that|repeat|next)[.!?\s]*$/i.test(String(message).trim())?previous.currentTask?.request||'':String(message).slice(0,500),...taskConstraints(message,productOperations(message).some(op=>op.type==='reset'&&!op.negated&&/conversation|everything/.test(message))?{}:previous.currentTask)};
  facts.adAngles=facts.product===previous.product?(previous.adAngles||[]):[];
  facts.evidence={...(facts.product===previous.product?previous.evidence:{} )};
  for(const field of ['product','part','colour','person','price','channel'])if(facts[field]!==previous[field]&&facts[field])facts.evidence[field]=String(message).slice(0,500);
  return facts;
}

function productRequestContext(message, history = [], previous = {}) {
  // The title names this course; it is not a lesson-task signal.
  let text = String(message || '');
  // Entity words are data, not symptoms; retain actual symptom clauses outside them.
  const declared=extractEntity(text);
  const identity=declared?.product || previous.product;
  if(identity){
    const escaped=identity.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    text=text.replace(new RegExp(escaped,'gu'),' '.repeat(identity.length));
  }
  text=text.replace(/\bAI\s+Product\s+Photoshoot\s*(?:&|and)\s*Ads\b/gi,'course');
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
  else if (/\b(?:arrange|assemble|order|edit)\b.{0,40}\bfinal ad\b|\bfinal ad\b.{0,40}\bclips\b|final\s+(?:(?:ad|project)\s+)?(?:workflow|order|assembly|edit)|finale|capcut|अंतिम|फाइनल/i.test(text)) {topic='final_assembly';inferredLesson=8;}
  else if (/\b(?:phone|handset|smartphone|mobile(?: device)?)\b.{0,100}\b(?:visible|frame|on.?screen|appear\w*|show\w*|dikh\w*|enters?|nazar|pok\w*|intrud\w*|protrud\w*)\b|\b(?:visible|appear\w*|show\w*|frame)\b.{0,60}\b(?:phone|handset|mobile(?: device)?)\b|(?:फोन|मोबाइल).*(?:दिख|फ्रेम|नज़र|नजर)/i.test(text)) {topic='phone_visibility';inferredLesson=7;}
  else if(outputs.includes('composition')){topic='composition';inferredLesson=2;}
  else if(outputs.includes('demo')){topic='ugc';inferredLesson=7;}
  else if(explicitLesson===7 && /settings|references|सेटिंग|संदर्भ/i.test(text)){topic='ugc';inferredLesson=7;}
  else if (/diwali|wedding|festiv|दिवाली|शादी|त्योहार/i.test(text)) {topic='festive';inferredLesson=4;}
  else if ((signals.colourAction || previous.topic==='colour' || previous.topic==='colour_shape' || (priorLesson===4&&/recolou?r|variants?|rang.*badal|रंग.*बदल/i.test(prior))) && /shape.{0,55}(?:chang|badal|recolou?r)|(?:chang|badal|different).{0,40}shape|आकार.{0,20}बदल/i.test(text)) {topic='colour_shape';inferredLesson=4;}
  else if (productOperations(message).some(op=>op.type==='recolour'&&!op.negated)) {topic='colour';inferredLesson=4;}
  else if (/brand.*(?:colou?r|shade)|(?:exact|precise).*(?:shade|colou?r)|रंग.*(?:मिल|सही)/i.test(text)) {topic='colour_shade';inferredLesson=4;}
  else if (/\b(?:ugc|handheld)\b|\b(?:polished|commercial|studio)\s+(?:looking\s+|style\s+)?(?:ad|video|clip|footage)\b|\b(?:ad|video|clip|footage)\s+(?:(?:looks?|feels?|is|seems?|too|very|so|a|like)\s+){1,5}(?:polished|commercial|studio)\b|यूजीसी/i.test(text)) {topic=/\b(?:polished|commercial|natural|studio)\b/i.test(text)?'natural_ugc':'ugc';inferredLesson=7;}
  else if (/\b(?:aspect ratio|landscape|portrait)\b.{0,100}(?:Reels|edges|किनार|खींच)|(?:Reels|किनार).{0,100}landscape/i.test(text)){topic='aspect_ratio';inferredLesson=6;}
  else if (/\b(?:blur\w*|lettering|small text)\b|धुंध|अक्षर|dhundle/i.test(text)) {topic='blur';inferredLesson=/\bvideo\b|वीडियो/i.test(text+' '+prior)?6:2;}
  else if (explicitLesson!==6 && !/\b(?:video|clips?|motion)\b|वीडियो/i.test(text) && /\b(?:photos?|images?|shots?)\b|फोटो|तस्वीर/i.test(text) && /(?:shape|आकार).{0,60}(?:chang|badal|बदल)|(?:chang|badal|बदल).{0,60}(?:shape|आकार)/i.test(text)) {topic='product_consistency';inferredLesson=2;}
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
      || topic==='motion' && /morph|warp|melt|pighal|problem|wrong|fix|बदल|पिघल|समस्या/i.test(text),
    procedural: /workflow|steps|settings|references|how (?:do|does|can|to)|तरीका|कदम|शुरुआत|सेटिंग|kaise|tareeka/i.test(text),
    requestedOutputs: requestedProductOutputs(text), previousTask:previous.currentTask?.request, tasks:signals.tasks, lessons:signals.lessons };
}

module.exports = { PRODUCT_SLUGS, PRODUCT_RECORDS, PRODUCT_TEMPLATES, cleanPdfText, parseProductKnowledge,
  wantsProductPrompt, wantsProductScene, findProductTemplate, productSlots, renderProductTemplate,
  cleanProductName, TEMPLATE_SLOTS, explicitTemplateSlots, productFacts, productRequestContext, productLessonNumber, requestedProductOutputs };
