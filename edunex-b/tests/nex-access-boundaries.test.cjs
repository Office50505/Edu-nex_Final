require('./helpers/deny-network.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {backend} = require('./ai-tutor-fixture.cjs');
const K = require('../services/tutorKnowledge');
const D = require('../services/transcriptDataset');
const {isPublicLesson} = require('../services/publicCourseAccess');
const {inspectPromptProvenance} = require('../services/courseTutorRequest');

// Real published course/lesson identities; only playback flags and synthetic
// learner entitlements vary. All provider transport is denied or injected.
const catalog = JSON.parse(fs.readFileSync(path.join(D.ROOT, 'published-catalog.json'))).courses;
const landing = require('./fixtures/landing-page-course.json');
const courses = structuredClone([...catalog.filter(c => c._id !== landing._id), landing]).map(c => ({
  ...c, accessType: 'premium', publicPreviewEnabled: false,
  videos: c.videos.map(v => ({...v, isFree: false})),
}));
const viewing = courses.find(c => c.slug === 'ai-local-buisness-ads');
const target = courses.find(c => c._id === landing._id);
const influencer = courses.find(c => c.slug === 'ai-influencer-course');
const pack = K.packFor(target);
const template = pack.records.find(r => r.contentType === 'exact-template' && r.lessonNumber === 5);
const sha = value => createHash('sha256').update(value).digest('hex');
const baseUser = {_id: 'access-boundary-offline', purchasedCourses: [], courseEntitlements: []};
const states = [
  {name: 'no purchases or subscription', user: baseUser},
  {name: 'expired course entitlement', user: {...baseUser, courseEntitlements: [
    {course: target._id, accessType: 'yearly', expiresAt: new Date(0)},
  ]}},
  {name: 'expired subscription', user: {...baseUser, subscriptionStatus: 'expired', subscriptionExpiry: new Date(0)},
    subscription: {status: 'active', currentPeriodEnd: new Date(0)}},
  {name: 'enrolled only in another course', user: {...baseUser, purchasedCourses: [viewing._id]}},
];
const quiet = {info() {}, warn() {}, log() {}};
const make = (state = states[0], extra = {}) => backend({courses, ...state,
  user: structuredClone(state.user), unifiedKnowledge: true, console: quiet, ...extra});
const player = {courseId: viewing._id, lessonId: viewing.videos[1]._id};
const context = (api, message, active = player) => api.service.buildContext(apiUser(api),
  active.courseId || '', message, [], {unifiedKnowledge: true, lessonId: active.lessonId || '', conversationId: 'access-boundary'});
// The service accepts the same synthetic learner identity used at the endpoint.
const apiUsers = new WeakMap();
function apiUser(api) { return apiUsers.get(api) || baseUser; }
function fixture(state = states[0], extra = {}) {
  const api = make(state, extra); apiUsers.set(api, structuredClone(state.user)); return api;
}
function assertPlaybackStillLocked(user) {
  assert.equal(K.activeCourseEntitlement(user, target._id), null);
  assert.ok(target.videos.every(v => !isPublicLesson(target, v)));
}
const exactQuestion = `Copy the exact approved ${target.title} ${template.heading} prompt unchanged in English.`;
const teachingQuestion = 'Explain AI Se Landing Page Banao Lesson 7 publishing step by step in English.';
const teachingReply = 'AI Se Landing Page Banao Lesson 7 notes: Upload the entire folder containing index.html and images to Netlify, open the live URL, and verify the images and WhatsApp buttons. Redeploy the full revised folder for updates.';

for (const state of states) test(`all integrated courses remain available to unified AI with ${state.name}`, async () => {
  const expected = [...require('./fixtures/unified-course-catalog.json').courses.map(c => c._id), target._id].sort();
  const integrated = courses.filter(c => K.isIntegratedCourse(c));
  assert.deepEqual(integrated.map(c => c._id).sort(), expected);
  const api = fixture(state);
  for (const owner of integrated) {
    const k = await context(api, `Explain ${owner.title} using its lesson knowledge in English.`);
    assert.deepEqual(k.unifiedAccess.courses.map(c => c._id).sort(), expected);
    const records = k.records.filter(r => r.courseId === owner._id);
    assert.ok(records.length, owner.title);
    assert.ok(k.sources.some(s => s.courseId === owner._id), owner.title);
    for (const r of records) assert.equal(sha(r.content), r.contentHash);
    assert.equal(k.viewingCourse.id, viewing._id);
  }
  assert.equal(api.calls.length, 0);
  assertPlaybackStillLocked(state.user);
});

for (const state of states) for (const [where, active] of [['another course player', player], ['no selected course', {}]]) {
  test(`approved cross-course prompts remain accessible with ${state.name}, from ${where}`, async () => {
    const api = fixture(state, {noKey: true});
    const before = JSON.stringify(state.user);
    assertPlaybackStillLocked(state.user);
    const r = await api.rawChat({...active, message: exactQuestion});
    assert.equal(r.statusCode, 200);
    const bodies = [...r.result.answer.matchAll(/```[^\n]*\n([\s\S]*?)\n```/gu)].map(m => m[1]);
    assert.ok(bodies.includes(template.content), 'The complete approved body must retain its original bytes');
    assert.ok(r.result.answer.includes(target.title));
    assert.ok(r.result.sources.some(s => s.courseId === target._id && s.lessonId === template.lessonId
      && s.chunkId === template.chunkId && s.contentHash === template.contentHash));
    assert.equal(api.calls.length, 0);
    assert.equal(JSON.stringify(state.user), before);
    assertPlaybackStillLocked(state.user);
  });
}

for (const state of states) test(`consented inference uses locked cross-course TXT knowledge with ${state.name}`, async () => {
  const api = fixture(state, {reply: teachingReply});
  const r = await api.rawChat({...player, message: teachingQuestion, debugAi: true});
  assert.equal(r.statusCode, 200);
  assert.equal(api.calls.length, 1, 'One injected response, never real inference');
  assert.equal(r.result.outcome.complete, true);
  assert.match(api.calls[0].messages[0].content, /AI Se Landing Page Banao/);
  assert.ok(r.result.sources.some(s => s.courseId === target._id && s.lessonId === target.videos[6]._id));
  assertPlaybackStillLocked(state.user);
});

for (const lesson of target.videos) test(`TXT Lesson ${lesson.order} is retrievable without enrollment or a free preview`, async () => {
  const api = fixture(states[1]);
  const k = await context(api, `Explain ${target.title} Lesson ${lesson.order}: ${lesson.title} step by step in English.`);
  const records = k.records.filter(r => r.courseId === target._id && r.lessonId === lesson._id
    && pack.records.some(p => p.chunkId === r.chunkId));
  assert.ok(records.length, 'A registered TXT chunk must be retrieved, not merely a catalog description');
  for (const r of records) {
    const source = pack.records.find(p => p.chunkId === r.chunkId);
    assert.equal(r.content, source.content);
    assert.equal(r.contentHash, source.contentHash);
    assert.equal(r.sourceHash, source.sourceHash);
    assert.ok(k.sources.some(s => s.chunkId === r.chunkId && s.courseId === target._id && s.lessonId === lesson._id));
  }
  assert.equal(k.viewingCourse.id, viewing._id);
  assert.equal(k.viewingLesson.id, viewing.videos[1]._id);
  assertPlaybackStillLocked(states[1].user);
});

for (const state of states) test(`cross-course timed transcript retrieval ignores playback eligibility: ${state.name}`, async () => {
  const api = fixture(state);
  const k = await context(api, 'Explain AI Influencer Lesson 5 transcript at 00:40 in English.');
  const records = k.records.filter(r => r.sourceType === 'transcript');
  assert.ok(records.length);
  assert.equal(k.transcriptContext.requested, true);
  assert.equal(k.transcriptContext.unresolved.length, 0);
  for (const r of records) {
    assert.equal(r.courseId, influencer._id);
    assert.equal(r.mediaId, influencer.videos[4]._id);
    assert.equal(r.lessonId, influencer.videos[4]._id);
    assert.equal(sha(r.content), r.contentHash);
    assert.ok(r.timeRange.startSeconds <= 40 && r.timeRange.endSeconds >= 40);
    const s = k.sources.find(s => s.chunkId === r.chunkId);
    assert.equal(s.courseId, r.courseId); assert.equal(s.lessonId, r.lessonId);
    assert.deepEqual(s.timeRange, r.timeRange);
  }
  assert.equal(k.viewingCourse.id, viewing._id);
  assert.equal(isPublicLesson(influencer, influencer.videos[4]), false);
  assert.equal(K.activeCourseEntitlement(state.user, influencer._id), null);
});

for (const consent of ['absent', 'declined', 'outdated']) test(`consent is independent of enrollment: ${consent} then accepted`, async () => {
  const api = fixture(states[0], {consent, reply: teachingReply});
  const request = {...player, message: teachingQuestion};
  const denied = await api.rawChat(request);
  assert.equal(denied.statusCode, 403); assert.equal(denied.result.code, 'AI_CONSENT_REQUIRED');
  assert.equal(api.calls.length, 0);
  const current = (await api.request('GET', '/consent')).result;
  const accepted = await api.request('PUT', '/consent', {
    granted: true, policyVersion: current.policyVersion, providerVersion: current.providerVersion,
  });
  assert.equal(accepted.result.granted, true);
  const r = await api.rawChat(request);
  assert.equal(r.statusCode, 200); assert.equal(api.calls.length, 1);
  assert.ok(r.result.sources.some(s => s.courseId === target._id));
  assertPlaybackStillLocked(baseUser);
});

test('changing free-preview flags changes playback eligibility without changing AI knowledge or citations', async () => {
  const freeCourses = structuredClone(courses).map(c => ({...c, accessType: 'free', publicPreviewEnabled: true,
    videos: c.videos.map(v => ({...v, isFree: true}))}));
  const locked = await context(fixture(), teachingQuestion);
  const free = await context(fixture(states[0], {courses: freeCourses}), teachingQuestion);
  const signature = k => k.records.map(r => [r.courseId, r.lessonId, r.chunkId, r.contentHash]);
  assert.deepEqual(signature(locked), signature(free));
  assert.deepEqual(locked.sources, free.sources);
  assert.equal(isPublicLesson(target, target.videos[6]), false);
  const unlocked = freeCourses.find(c => c._id === target._id);
  assert.equal(isPublicLesson(unlocked, unlocked.videos[6]), true);
  assert.equal(K.activeCourseEntitlement(baseUser, target._id), null);
});

test('customization labels preserve source attribution without changing the registered approved prompt', async () => {
  const k = await context(fixture(), `Explain ${target.title} Lesson 5 prompts in English.`);
  const content = template.content + '\nUse only actual details supplied by the learner.';
  const reply = `**Approved Prompt (${target.title} Lesson 5):**\n\`\`\`text\n${content}\n\`\`\``;
  const original = template.content;
  const fixed = inspectPromptProvenance(reply, k, {rewrite: true});
  assert.equal(fixed.answer, reply.replace('Approved Prompt', 'Customized AI Prompt'));
  assert.deepEqual(inspectPromptProvenance(fixed.answer, k).issues, []);
  assert.equal(template.content, original); assert.equal(sha(template.content), template.contentHash);
});

test('TXT ingestion and canonical source byte ranges remain intact without re-ingestion', () => {
  const root = path.resolve(__dirname, '../knowledge/ai-landing-page');
  assert.equal(pack.records.length, 49);
  assert.equal(new Set(pack.records.map(r => r.chunkId)).size, 49);
  const raw = fs.readFileSync(path.join(root, 'sources/Nex_AI_Landing_Page_Knowledge_Base.txt'));
  for (const r of pack.records) {
    assert.equal(sha(r.content), r.contentHash); assert.equal(sha(raw), r.sourceHash);
    if (r.contentType === 'exact-template') assert.equal(raw.subarray(r.sourceStartByte, r.sourceEndByte).toString(), r.content);
  }
  assert.equal(pack.records.filter(r => r.contentType === 'exact-template').length, 10);
});

test('unified access still requires authentication; consent and client flags cannot bypass it', async () => {
  const api = fixture();
  const r = await api.request('POST', '/chat', {message: teachingQuestion, ...player,
    consentGranted: true, includeMaterials: true, isFree: true}, false);
  assert.equal(r.statusCode, 401); assert.equal(api.calls.length, 0);
});
