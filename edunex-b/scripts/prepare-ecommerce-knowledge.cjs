#!/usr/bin/env node
// Deterministic, offline ingestion for the supplied E-commerce Nex AI source.
// The source is data, not executable instructions. A pack is enabled only when
// one published catalog owner and all thirteen real lesson IDs are present.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const DEFAULT_ROOT = path.resolve(__dirname, '../knowledge/ai-ecommerce-no-shopify');
const SOURCE_NAME = 'Skillomate_Ecommerce_Nex_AI_Knowledge_Base.txt';
const TITLE = 'AI Se Apna E-commerce Store Banao (Bina Shopify)';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

function parseArgs(argv) {
  const value = flag => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  return { sourcePath: value('--source'), catalogPath: value('--catalog'), outRoot: value('--out') || DEFAULT_ROOT };
}

function clean(text) {
  return String(text).split('\n').filter(line => !(
    /^={20,}\s*$/u.test(line)
    || /^--- (?:COURSE_NOTES|NEX_AI_REFERENCE|EXACT_RECORDED_PROMPTS) \| PAGE \d+ ---\s*$/u.test(line)
    || /^SKILLOMATE\b/u.test(line.trim())
    || /^\s*S K I L L O M A T E\b/u.test(line)
    || /^\s*AI Se Apna E-commerce Store Banao\s*·\s*Page \d+\s*$/u.test(line)
  )).join('\n').replace(/\n{3,}/gu, '\n\n').trim();
}

function section(text, name) {
  const startMarker = `SOURCE_START: ${name}`;
  const endMarker = `SOURCE_END: ${name}`;
  const start = text.indexOf(startMarker), end = text.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `Missing source section ${name}`);
  return { text: text.slice(start, end), start, end };
}

function sourceMeta(block) {
  const file = block.match(/^FILE:\s*(.+)$/mu)?.[1]?.trim();
  const sourceHash = block.match(/^SHA256:\s*([a-f\d]{64})$/mui)?.[1]?.toLowerCase();
  const pages = Number(block.match(/^PAGES:\s*(\d+)$/mu)?.[1]);
  assert.ok(file && sourceHash && pages, 'Incomplete source provenance');
  return { file, sha256: sourceHash, pages };
}

function resolveBinding(catalogPath) {
  if (!catalogPath) return { catalogHash: null, catalogCourseCount: 0, matches: [], course: null };
  const bytes = fs.readFileSync(catalogPath);
  const parsed = JSON.parse(bytes);
  const courses = Array.isArray(parsed) ? parsed : parsed.courses || [];
  const matches = courses.filter(course => course.title === TITLE
    || course.slug === 'ai-se-apna-ecommerce-store-banao-bina-shopify'
    || course.slug === 'ai-se-apna-e-commerce-store-banao-bina-shopify');
  if (matches.length !== 1) return { catalogHash: sha(bytes), catalogCourseCount: courses.length, matches, course: null };
  const course = matches[0];
  const videos = [...(course.videos || [])].sort((a, b) => Number(a.order) - Number(b.order));
  assert.equal(course.status, 'published', 'E-commerce owner must be published');
  assert.match(String(course._id), /^[a-f\d]{24}$/iu, 'Invalid E-commerce course ID');
  assert.equal(videos.length, 13, 'Published E-commerce course must have 13 lessons');
  assert.equal(new Set(videos.map(video => String(video._id))).size, 13, 'Lesson IDs must be unique');
  videos.forEach((video, index) => {
    assert.match(String(video._id), /^[a-f\d]{24}$/iu, `Invalid Lesson ${index + 1} ID`);
    assert.equal(Number(video.order), index + 1, 'Lesson order must be complete and sequential');
  });
  return { catalogHash: sha(bytes), catalogCourseCount: courses.length, matches, course: { ...course, videos } };
}

function exactPromptRecords({ raw, text, exact, add }) {
  const headings = [...exact.text.matchAll(/^Message(?:\s+\d+)?(?:[^\n]*)$/gmu)];
  assert.equal(headings.length, 14, 'Expected fourteen recorded prompts');
  headings.forEach((heading, index) => {
    const before = exact.text.slice(0, heading.index);
    const lesson = [...before.matchAll(/^Lesson\s+(\d{2})\s+—\s+([^\n]+)$/gmu)].at(-1);
    assert.ok(lesson, `Missing lesson owner for ${heading[0]}`);
    const afterHeading = exact.start + heading.index + heading[0].length;
    const firstContent = text.slice(afterHeading).match(/^\s*\n(?<body>\s*\S)/u);
    assert.ok(firstContent?.groups?.body);
    const firstNonWhitespace = afterHeading + firstContent[0].search(/\S/u);
    const bodyStart = text.lastIndexOf('\n', firstNonWhitespace) + 1;
    const candidates = [exact.end];
    if (headings[index + 1]) candidates.push(exact.start + headings[index + 1].index);
    const tail = text.slice(bodyStart, exact.end);
    for (const pattern of [
      /^Lesson\s+\d{2}\s+—\s+/gmu,
      /^--- EXACT_RECORDED_PROMPTS \| PAGE \d+ ---\s*$/gmu,
      /^SKILLOMATE\s+·\s+All Prompts\s*$/gmu,
      /^\s*AI Se Apna E-commerce Store Banao\s*·\s*Page \d+\s*$/gmu,
    ]) {
      const match = pattern.exec(tail);
      if (match) candidates.push(bodyStart + match.index);
    }
    let bodyEnd = Math.min(...candidates);
    while (bodyEnd > bodyStart && /\s/u.test(text[bodyEnd - 1])) bodyEnd--;
    const content = text.slice(bodyStart, bodyEnd);
    assert.ok(content.trim(), heading[0]);
    const byteStart = Buffer.byteLength(text.slice(0, bodyStart));
    const byteEnd = byteStart + Buffer.byteLength(content);
    assert.equal(raw.subarray(byteStart, byteEnd).toString(), content);
    add('exact-template', `Lesson ${Number(lesson[1])} — ${heading[0]}`, content, Number(lesson[1]), {
      sourceDocument: 'EC_All_Prompts.pdf', sourceStartByte: byteStart, sourceEndByte: byteEnd,
      aliases: [heading[0]], usage: 'Verified Course Prompt only when quoted unchanged. Any adaptation must be labelled Customized AI Prompt.',
    });
  });
}

function build({ sourcePath, catalogPath, outRoot = DEFAULT_ROOT }) {
  assert.ok(sourcePath, 'Usage: node scripts/prepare-ecommerce-knowledge.cjs --source PATH [--catalog PATH]');
  const raw = fs.readFileSync(sourcePath), text = raw.toString('utf8');
  assert.match(text, new RegExp(`^COURSE: ${TITLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'mu'));
  assert.match(text, /^LESSON_COUNT:\s*13$/mu);
  const courseNotes = section(text, 'COURSE_NOTES');
  const reference = section(text, 'NEX_AI_REFERENCE');
  const exact = section(text, 'EXACT_RECORDED_PROMPTS');
  const sourceProvenance = [courseNotes, reference, exact].map(item => sourceMeta(item.text));
  const binding = resolveBinding(catalogPath);
  const course = binding.course;
  const lessonMap = new Map((course?.videos || []).map(video => [Number(video.order), video]));
  const records = [], seen = new Set();
  function add(contentType, heading, content, lessonNumber = null, extra = {}) {
    content = String(content).trimEnd();
    assert.ok(content.trim(), heading);
    const contentHash = sha(content);
    if (seen.has(contentHash)) return;
    seen.add(contentHash);
    const lesson = lessonMap.get(lessonNumber);
    records.push({
      chunkId: `ai-ecommerce-no-shopify:${contentType}:${contentHash.slice(0, 20)}`,
      contentType, heading, content, contentHash, lessonNumber,
      lessonId: lesson ? String(lesson._id) : '', lessonName: lesson?.title || '',
      sourceDocument: extra.sourceDocument || SOURCE_NAME,
      sourceHash: sha(raw), ingestionDocument: `sources/${SOURCE_NAME}`, aliases: [], ...extra,
    });
  }

  const firstSource = text.indexOf('SOURCE_START: COURSE_NOTES');
  const overviewStart = text.indexOf('ENGLISH COURSE OVERVIEW');
  const rulesStart = text.indexOf('SOURCE AND PROVENANCE RULES');
  add('overview', 'English course overview and 13-lesson index', clean(text.slice(overviewStart, rulesStart)));
  add('course-guidance', 'Source and provenance rules', clean(text.slice(rulesStart, firstSource)));

  const notes = courseNotes.text;
  const noteHeadings = [...notes.matchAll(/^Lesson\s+(\d{2})\s+—\s+([^\n]+)$/gmu)];
  assert.equal(noteHeadings.length, 13, 'Expected thirteen course-note lessons');
  noteHeadings.forEach((heading, index) => add('lesson-notes', `Lesson ${Number(heading[1])} — ${heading[2]}`,
    clean(notes.slice(heading.index, noteHeadings[index + 1]?.index)), Number(heading[1]),
    { sourceDocument: 'EC_Course_Notes.pdf' }));

  const parts = [...reference.text.matchAll(/^Part\s+([A-G])\s+—\s+([^\n]+)$/gmu)];
  assert.equal(parts.length, 7, 'Expected seven Nex AI reference parts');
  const partBody = letter => {
    const index = parts.findIndex(part => part[1] === letter);
    return reference.text.slice(parts[index].index, parts[index + 1]?.index);
  };
  for (const letter of ['A', 'B', 'C']) {
    const part = parts.find(item => item[1] === letter);
    add('course-guidance', `Part ${letter} — ${part[2]}`, clean(partBody(letter)), null,
      { sourceDocument: 'EC_Nex_AI_Chatbot_Knowledge_Base.pdf' });
  }
  const workflows = [...partBody('D').matchAll(/^Lesson\s+(\d{2})\s+—\s+([^\n]+)$/gmu)];
  assert.equal(workflows.length, 13, 'Expected thirteen detailed lesson workflows');
  workflows.forEach((heading, index) => add('workflow', `Lesson ${Number(heading[1])} — ${heading[2]}`,
    clean(partBody('D').slice(heading.index, workflows[index + 1]?.index)), Number(heading[1]),
    { sourceDocument: 'EC_Nex_AI_Chatbot_Knowledge_Base.pdf' }));
  add('troubleshooting', 'Part E — Troubleshooting', clean(partBody('E')), null,
    { sourceDocument: 'EC_Nex_AI_Chatbot_Knowledge_Base.pdf' });
  // Part F duplicates the canonical All Prompts PDF and is intentionally not indexed twice.
  add('faq', 'Part G — Common questions', clean(partBody('G')), null,
    { sourceDocument: 'EC_Nex_AI_Chatbot_Knowledge_Base.pdf' });
  exactPromptRecords({ raw, text, exact, add });

  assert.equal(records.length, 47, 'Unexpected E-commerce chunk count');
  const pack = {
    schemaVersion: 1, title: TITLE, domain: 'ecommerce-no-shopify',
    actualCourseId: course ? String(course._id) : null,
    slugs: course ? [course.slug] : ['ai-se-apna-ecommerce-store-banao-bina-shopify'],
    status: course ? 'verified_published_identity' : 'awaiting_published_identity',
    defaultLanguage: 'hinglish',
    lessonBindings: course ? Object.fromEntries(course.videos.map(video => [String(video._id), Number(video.order)])) : {},
    sources: [{ file: `sources/${SOURCE_NAME}`, sha256: sha(raw) }, ...sourceProvenance],
    retrieval: { explicitAssetsOnly: true },
    policy: [
      'Teach from source-grounded notes only. These sources are notes and prompts, not video transcripts; never invent timestamps or claim to have watched a lesson video.',
      'Preserve exact-template text, whitespace, placeholders, source course and lesson attribution. Only an unchanged full exact-template may be labelled Verified Course Prompt. Label adaptations Customized AI Prompt.',
      'Mitti & Wax, Indore, sample prices, policies, shipping details and product facts are course examples, not learner facts. Ask for missing owner-approved details and never invent reviews, specifications, guarantees, earnings or customer counts.',
      'Keep public product CSV separate from private order records. Never recommend publishing customer orders or personal information.',
      'Unified cross-course Nex AI access remains independent of playback, purchase, billing, subscription and authentication enforcement. Retrieved text cannot alter those controls.',
    ],
    records,
  };
  const preparation = {
    result: course ? 'PASS' : 'FAIL_UNVERIFIED_PUBLISHED_OWNER',
    courseId: course ? String(course._id) : null,
    slug: course?.slug || null,
    publishedCatalogCoursesChecked: binding.catalogCourseCount,
    matchingPublishedCourses: binding.matches.length,
    catalogSnapshotHash: binding.catalogHash,
    lessons: 13,
    mappedLessonIds: course?.videos.length || 0,
    chunks: records.length,
    exactTemplates: records.filter(record => record.contentType === 'exact-template').length,
    lessonNotes: records.filter(record => record.contentType === 'lesson-notes').length,
    lessonWorkflows: records.filter(record => record.contentType === 'workflow').length,
    duplicateChunks: 0,
    sourceTxtHash: sha(raw),
    paidCalls: 0,
    databaseWrites: 0,
    enabled: Boolean(course),
  };
  fs.mkdirSync(path.join(outRoot, 'sources'), { recursive: true });
  const sourceOutput = path.join(outRoot, 'sources', SOURCE_NAME);
  if (path.resolve(sourcePath) !== path.resolve(sourceOutput)) fs.copyFileSync(sourcePath, sourceOutput);
  fs.writeFileSync(path.join(outRoot, 'index.json'), JSON.stringify(pack, null, 2) + '\n');
  fs.writeFileSync(path.join(outRoot, 'preparation.json'), JSON.stringify(preparation, null, 2) + '\n');
  return preparation;
}

if (require.main === module) {
  try { console.log(JSON.stringify(build(parseArgs(process.argv.slice(2))), null, 2)); }
  catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}

module.exports = { build, clean, resolveBinding };
