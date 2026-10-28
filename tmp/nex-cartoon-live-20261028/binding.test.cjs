require('../../edunex-b/tests/helpers/deny-network.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { bindCartoon, backendRequire } = require('./binding.cjs');
const binding = bindCartoon();
const K = backendRequire('./services/tutorKnowledge');
const { backend } = require('../../edunex-b/tests/ai-tutor-fixture.cjs');
const user = { _id: '6addcefc5d47d548973c29b9', purchasedCourses: [binding.course._id] };
test('real published binding resolves only the verified owner and all eight actual lesson IDs', () => {
  assert.equal(K.packFor(binding.course), binding.pack);
  assert.equal(K.packFor({ ...binding.course, _id: '6f0000000000000000000999' }), undefined);
  assert.equal(K.packFor({ ...binding.course, slug: 'guessed-cartoon-alias' }), undefined);
  for (const lesson of binding.course.videos) {
    const k = K.retrieveKnowledge({ courses: [binding.course], activeCourse: binding.course, activeLesson: lesson, includeMaterials: true, message: 'Explain this video.' });
    assert.ok(k.records.some(r => r.contentType === 'lesson-summary' && r.lessonNumber === lesson.order));
    assert.ok(k.records.every(r => r.courseId === binding.course._id));
  }
});
for (const template of binding.pack.records.filter(r => r.contentType === 'exact-template')) test(`real course exact bytes: ${template.heading}`, async () => {
  const api = backend({ courses: [binding.course], user, reply: 'A provider must not run for an approved exact asset.' });
  const r = await api.chat({ activeCourseId: binding.course._id, message: `Give the complete exact approved ${template.heading} prompt unchanged.` });
  assert.equal(r.answer.match(/```text\n([\s\S]*?)\n```/u)?.[1], template.content);
  assert.equal(api.calls.length, 0);
});
test('the real course requires authentication and ignores client-supplied entitlement flags', async () => {
  const api = backend({ courses: [binding.course], user: { _id: user._id } });
  const question = { activeCourseId: binding.course._id, message: 'Give exact approved Lesson 05 Step 1 Start frame prompt.', isAdmin: true, hasAccess: true };
  const denied = await api.chat(question);
  assert.equal(denied.knowledge, 'course-overviews');
  assert.equal(api.calls.length, 0);
  assert.equal((await api.request('POST', '/chat', question, false)).statusCode, 401);
  for (const t of binding.pack.records.filter(r => r.contentType === 'exact-template')) assert.ok(!denied.answer.includes(t.content));
});
