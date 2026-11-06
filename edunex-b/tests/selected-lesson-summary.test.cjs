const test = require('node:test');
const assert = require('node:assert/strict');
const { backend } = require('./ai-tutor-fixture.cjs');
const { selectedLessonSummary } = require('../services/selectedLessonSummary');

const course = {
  _id: '6e0000000000000000000040', slug: 'lesson-summary-fixture', title: 'Creator Basics', status: 'published',
  videos: [
    { _id: 'lesson-1', title: 'Tools Setup', description: 'Organize your tools before creating.',
      notes: 'Use Google Flow for photos and videos.\n\nUse VN for editing.\n\nUse ChatGPT for scripts and prompts.\n\nKeep the tools together in an AI Studio folder.' },
    { _id: 'lesson-2', title: 'Other lesson', notes: 'OTHER_LESSON_PRIVATE_DETAIL' },
  ],
};
const other = { _id: '6e0000000000000000000041', slug: 'other-summary-course', title: 'Other course', status: 'published',
  videos: [{ _id: 'other-id', title: 'Other material', notes: 'OTHER_COURSE_PRIVATE_DETAIL' }] };
const user = { _id: '6e0000000000000000000042', purchasedCourses: [course._id] };

for (const noKey of [true, false]) test(`player summary works with provider ${noKey ? 'unconfigured' : 'offline'}`, async () => {
  const api = backend({ courses: [course, other], user, noKey, fail: true });
  const r = await api.rawChat({ courseId: course._id, lessonId: 'lesson-1', message: 'Summarize this video' });
  assert.equal(r.statusCode, 200);
  assert.equal(r.result.outcome.type, 'local_rule');
  assert.match(r.result.answer, /Tools Setup/);
  assert.match(r.result.answer, /saved lesson material/);
  assert.match(r.result.answer, /Google Flow/);
  assert.match(r.result.answer, /VN/);
  assert.doesNotMatch(r.result.answer, /OTHER_LESSON_PRIVATE_DETAIL|OTHER_COURSE_PRIVATE_DETAIL/);
  assert.equal(api.calls.length, 0);
});

test('summary cannot use protected notes without server-verified access', async () => {
  const api = backend({ courses: [course, other], user: { _id: user._id }, noKey: true });
  const r = await api.rawChat({ courseId: course._id, lessonId: 'lesson-1', message: 'Summarize this video', includeMaterials: true });
  assert.equal(r.statusCode, 503);
  assert.doesNotMatch(JSON.stringify(r.result), /Use Google Flow|AI Studio folder/);
});

test('a missing or mismatched lesson does not summarize a different lesson', async () => {
  const api = backend({ courses: [course, other], user, noKey: true });
  for (const lessonId of [undefined, 'other-id', 'does-not-exist']) {
    const r = await api.rawChat({ courseId: course._id, lessonId, message: 'Summarize this video' });
    assert.equal(r.statusCode, 503);
    assert.equal(r.result.answer, undefined);
  }
});

test('unrelated and compound requests still surface genuine inference failures', async () => {
  const api = backend({ courses: [course, other], user, noKey: true });
  for (const message of ['Write a new advertising script.', 'Summarize this video and write a custom campaign.']) {
    const r = await api.rawChat({ courseId: course._id, lessonId: 'lesson-1', message });
    assert.equal(r.statusCode, 503);
    assert.equal(r.result.answer, undefined);
  }
});

test('missing material never becomes a fabricated summary', () => {
  const knowledge = { materialsAvailable: true, activeCourse: { id: course._id }, activeLesson: { title: 'Tools Setup' } };
  assert.equal(selectedLessonSummary({ message: 'Summarize this video', knowledge }), '');
});
