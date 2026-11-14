require('./helpers/deny-network.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {backend} = require('./ai-tutor-fixture.cjs');
const K = require('../services/tutorKnowledge');
const R = require('../services/tutorReliability');
const {inspectPromptProvenance} = require('../services/courseTutorRequest');
const course = require('./fixtures/landing-page-course.json');
const previous = require('./fixtures/unified-course-catalog.json').courses;
const courses = [...previous, course];
const user = {_id: 'landing-page-offline', purchasedCourses: []};
const pack = K.packFor(course);
const root = path.resolve(__dirname, '../knowledge/ai-landing-page');
const sha = s => createHash('sha256').update(s).digest('hex');
const quiet = {info() {}, warn() {}, log() {}};
const make = extra => backend({courses, user, unifiedKnowledge: true, console: quiet, ...extra});
const context = (message, viewing = course, lesson = viewing.videos[0]) => make().service.buildContext(
  user, viewing._id, message, [], {unifiedKnowledge: true, lessonId: lesson._id, conversationId: 'landing-offline'});

test('published identity and all 11 PDF note mappings match preserved database records', () => {
  assert.equal(course._id, '6aeb1d5f2497c8173516e257');
  assert.equal(course.status, 'published');
  assert.equal(pack.actualCourseId, course._id);
  const binding = require('../knowledge/ai-landing-page/course-binding.json');
  const preparation = require('../knowledge/ai-landing-page/preparation.json');
  assert.equal(course.videos.length, 11);
  assert.equal(new Set(course.videos.map(v => v._id)).size, 11);
  assert.deepEqual(pack.lessonBindings, Object.fromEntries(course.videos.map(v => [v._id, v.order])));
  assert.equal(preparation.existingPdfNotesReused, 11);
  assert.equal(preparation.databaseWrites, 0);
  for (const v of course.videos) {
    assert.equal(binding.course.videos.find(b => b._id === v._id).notesHash, sha(v.notes));
    assert.ok(preparation.lessonNotes.some(n => n.lessonId === v._id && n.lessonNumber === v.order && n.matchesExistingNotes));
  }
});

test('all supplied source hashes and every canonical byte range are intact; no duplicate chunks', () => {
  assert.equal(new Set(pack.records.map(r => r.chunkId)).size, pack.records.length);
  assert.equal(new Set(pack.records.map(r => r.contentHash)).size, pack.records.length);
  assert.equal(pack.records.length, 49);
  for (const source of pack.sources) assert.equal(sha(fs.readFileSync(path.join(root, source.file))), source.sha256);
  const raw = fs.readFileSync(path.join(root, 'sources/Nex_AI_Landing_Page_Knowledge_Base.txt'));
  for (const r of pack.records) {
    assert.equal(sha(r.content), r.contentHash);
    if (r.contentType === 'exact-template') assert.equal(raw.subarray(r.sourceStartByte, r.sourceEndByte).toString(), r.content);
    if (r.lessonNumber) assert.ok(course.videos.some(v => v.order === r.lessonNumber && v._id === r.lessonId));
  }
  assert.equal(pack.records.filter(r => r.contentType === 'exact-template').length, 10);
  assert.equal(pack.records.filter(r => r.contentType === 'counterexample').length, 1);
});

for (const v of course.videos) test(`Lesson ${v.order} has correctly attributed knowledge in its own and another course player`, async () => {
  const message = `Explain AI Se Landing Page Banao Lesson ${v.order}: ${v.title} step by step in English.`;
  for (const viewing of [course, previous[0]]) {
    const k = await context(message, viewing, viewing === course ? v : viewing.videos[0]);
    assert.equal(k.transcriptContext.requested, false, 'Notes teaching must not require an unavailable transcript');
    assert.ok(k.records.some(r => r.courseId === course._id && r.lessonId === v._id && r.lessonNumber === v.order), JSON.stringify(k.sources));
    assert.equal(k.viewingCourse.id, viewing._id);
    for (const source of k.sources.filter(s => s.courseId === course._id && s.lessonId)) {
      assert.equal(source.courseName, course.title);
      assert.ok(course.videos.some(v => v._id === source.lessonId));
    }
  }
});

const templates = pack.records.filter(r => r.contentType === 'exact-template');
for (const t of templates) test(`exact template remains byte-identical across course players: ${t.heading}`, async () => {
  const api = make();
  const viewing = previous[0];
  const message = `Copy the exact approved AI Se Landing Page Banao ${t.heading} prompt unchanged in English.`;
  const r = await api.rawChat({message, courseId: viewing._id, lessonId: viewing.videos[0]._id, conversationId: 'landing-exact', debugAi: true});
  assert.equal(r.statusCode, 200);
  assert.ok(r.result.answer.includes(t.content), r.result.answer);
  assert.ok(r.result.answer.includes(course.title));
  assert.ok(r.result.sources.some(s => s.courseId === course._id && s.lessonId === t.lessonId));
  assert.equal(api.calls.length, 0);
});

for (const t of templates) test(`adaptation cannot inherit course approval: ${t.heading}`, async () => {
  const k = await context(`Explain AI Se Landing Page Banao Lesson ${t.lessonNumber} prompts in English.`);
  const body = t.content + '\nUse the actual learner details for this adaptation.';
  const label = `Approved Prompt (${course.title} Lesson ${t.lessonNumber})`;
  const text = '**' + label + ':**\n```text\n' + body + '\n```';
  assert.ok(inspectPromptProvenance(text, k).issues.length);
  const fixed = inspectPromptProvenance(text, k, {rewrite: true});
  assert.equal(fixed.answer, text.replace('Approved Prompt', 'Customized AI Prompt'));
  assert.deepEqual(inspectPromptProvenance(fixed.answer, k).issues, []);
});

for (const viewing of previous) test(`cross-course retrieval preserves viewing context and entitlements: ${viewing.title}`, async () => {
  const before = JSON.stringify(user);
  const k = await context('Explain AI Se Landing Page Banao Lesson 7 Netlify folder publishing step by step in English.', viewing);
  assert.ok(k.records.some(r => r.courseId === course._id && r.lessonNumber === 7));
  assert.equal(k.viewingCourse.id, viewing._id);
  assert.equal(k.viewingLesson.id, viewing.videos[0]._id);
  assert.equal(K.activeCourseEntitlement(user, course._id), null);
  assert.equal(JSON.stringify(user), before);
});

for (const [lesson, question, expected] of [
  [6, 'My page image is missing; troubleshoot the image filenames.', /cakes\.jpg/],
  [5, 'HTML code is incomplete and my file saved as index.html.txt; how do I fix it?', /index\.html/],
  [5, 'WhatsApp button opens the wrong number; how should I fix the placeholder?', /wa\.me|WhatsApp/],
  [7, 'Netlify published page has broken images; how should I redeploy the folder?', /folder/],
]) test(`retrieval supplies troubleshooting evidence: ${question}`, async () => {
  const k = await context(`AI Se Landing Page Banao Lesson ${lesson}: ${question} In English.`);
  const records = k.records.filter(r => r.courseId === course._id);
  assert.ok(records.some(r => r.lessonNumber === lesson));
  assert.match(records.map(r => r.content).join('\n'), expected);
});

test('customized landing-page answer is corrected and validated after final output transformation', async () => {
  const message = 'Explain AI Se Landing Page Banao Lesson 2 planning prompt in English.';
  const knowledge = await context(message);
  const reply = `AI Se Landing Page Banao Lesson 2:\n**Approved Prompt:**\n\`\`\`text\nUse the business details supplied by the learner to plan the page.\n\`\`\``;
  const result = R.finalizeUnifiedAnswer({reply, message, history: [], knowledge,
    transform: s => s + '\nSource: AI Se Landing Page Banao Lesson 2 — Approved Prompt'});
  assert.match(result.answer, /Customized AI Prompt/);
  assert.doesNotMatch(result.answer, /Approved Prompt/);
  assert.deepEqual(result.finalValidation.issues, []);
  assert.equal(result.assessment.complete, true);
});

test('ordinary notes teaching reaches final delivery, while an explicit missing-video transcript remains unavailable', async () => {
  const viewing = previous[0];
  const message = 'Explain AI Se Landing Page Banao Lesson 7 publishing step by step in English.';
  const reply = 'AI Se Landing Page Banao Lesson 7 notes: Upload the entire folder containing index.html and images to Netlify, open the live URL, and verify the images and WhatsApp buttons. Redeploy the full revised folder for updates.';
  const api = make({reply});
  const response = await api.rawChat({message, courseId: viewing._id, lessonId: viewing.videos[0]._id, debugAi: true});
  assert.equal(response.statusCode, 200);
  assert.ok(response.result.answer.includes('index.html'), response.result.answer);
  assert.equal(response.result.outcome.complete, true, JSON.stringify(response.result.debug));
  assert.equal(api.calls.length, 1, 'One injected saved fixture; no real provider call');
  const k = await context('What did the instructor say in AI Se Landing Page Banao Lesson 7 video at 00:10?');
  assert.equal(k.transcriptContext.requested, true);
  assert.ok(k.transcriptContext.unresolved.length);
});

test('course policy separates exact quotes, student facts, examples, truthfulness and missing information', async () => {
  const k = await context('Explain the AI Se Landing Page Banao course in English.');
  for (const value of ['COURSE EXAMPLES', 'Customized AI Prompt', 'never established learner/client facts',
    'Never invent reviews', 'unavailable instead of guessing', 'not video transcripts', 'guarantees']) {
    assert.ok(k.context.includes(value), value);
  }
  assert.ok(pack.records.filter(r => r.lessonNumber === 10).some(r => /example prices|COURSE|sample|Practice/i.test(r.content)));
});

test('knowledge registration cannot grant access to a different owner with a copied slug', () => {
  assert.equal(K.isIntegratedCourse({...course, _id: previous[0]._id}), false);
  assert.equal(K.packFor({...course, _id: previous[0]._id}), undefined);
});
