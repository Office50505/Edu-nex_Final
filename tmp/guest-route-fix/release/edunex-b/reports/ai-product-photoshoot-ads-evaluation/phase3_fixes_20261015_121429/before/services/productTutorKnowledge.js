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
  return /\b(?:prompt|template|wording|copy[- ]?paste)\b|प्रॉम्प्ट|प्रॉम्पट/i.test(message)
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

function productSlots(message, history = []) {
  const values = {};
  const userTexts = [...history.filter(t => t.role === 'user').map(t => t.content), message];
  for (const text of userTexts) {
    // Extract only explicitly supplied noun phrases; never infer attributes from the product category.
    const product = String(text).match(/\b(?:for|of)\s+(?:(?:a|an|my|the|this)\s+)?([\p{L}\p{N}][\p{L}\p{N} '\-]{1,90}?)(?=[.!?\n]|$)/iu)
      || String(text).match(/\bI\s+(?:sell|have|use)\s+(?:(?:a|an|the|my)\s+)?([\p{L}\p{N}][\p{L}\p{N} '\-]{1,90}?)(?=\s+on\b|[.!?\n]|$)/iu)
      || String(text).match(/\b(?:my product is|product name is)\s+([\p{L}\p{N}][\p{L}\p{N} '\-]{1,90}?)(?=[.!?\n]|$)/iu);
    const localProduct = String(text).match(/\b(?:mera|meri)\s+product\s+([\p{L}\p{N} '\-]{1,90}?)\s+hai\b/iu)
      || String(text).match(/(?:मेरा|मेरी)\s+(?:प्रोडक्ट|उत्पाद)\s+([\p{L}\p{N}\p{M} '\-]{1,90}?)\s+है/u);
    if (product && !/\b(?:that|this|changing|creating|making|same|me|course|prompt|template|ignore|system|developer|instead)\b/i.test(product[1])) values.product = normalize(product[1]);
    if (localProduct) values.product = normalize(localProduct[1]);
    const variant = String(text).match(/\bchang(?:e|ing)\s+(?:the\s+)?(.{1,70}?)\s+to\s+(.{1,50}?)(?=[.!?\n]|$)/i);
    if (variant && /^[\p{L}\p{N} '\-]+$/u.test(variant[1]) && /^[\p{L}\p{N} '\-]+$/u.test(variant[2])) {
      values.part = normalize(variant[1]); values.colour = normalize(variant[2]);
    }
    const person = String(text).match(/\b(?:young Indian|adult|character|model|for a)\s+(woman|man)\b/i);
    if (person) values.person = person[1].toLowerCase();
  }
  return values;
}

function renderProductTemplate(template, values = {}) {
  let content = template.content;
  if (values.product) content = content.replace(/\[product\]/gi, () => values.product);
  if (values.person) content = content.replace(/\[man\s*\/\s*woman\]/gi, values.person);
  if (values.part) content = content.replace(/\[the part, e\.g\. [^\]]+\]/g, () => values.part);
  if (values.colour) content = content.replace(/\[new colour, e\.g\. [^\]]+\]/g, () => values.colour);
  return content;
}

module.exports = { PRODUCT_SLUGS, PRODUCT_RECORDS, PRODUCT_TEMPLATES, cleanPdfText, parseProductKnowledge,
  wantsProductPrompt, findProductTemplate, productSlots, renderProductTemplate };
