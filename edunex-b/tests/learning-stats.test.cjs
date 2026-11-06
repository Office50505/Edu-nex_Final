const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const rules = require('../services/completionRules');
const serviceSource = fs.readFileSync(require.resolve('../services/mobileCompatibilityService'), 'utf8');
const statsSource = serviceSource.slice(serviceSource.indexOf('async function learningStatsForUser('), serviceSource.indexOf('\nasync function progressForUser('));

test('statistics count distinct real dates and completed courses, not rounded percentages', async () => {
  const c = {
    AnalyticsEvent: { distinct: async (field, filter) => {
      assert.equal(field, 'date'); assert.equal(filter.userId, 'learner');
      assert.ok(filter.event.$in.includes('learning_day'));
      return ['2026-11-01', '2026-11-01', '2026-11-02', 'invalid', '2026-02-30'];
    } },
    CourseProgress: { find: filter => {
      assert.equal(filter.userId, 'learner');
      return { select: () => ({ lean: async () => [
        { courseId: 'a', totalVideos: 10, completedCount: 10 },
        { courseId: 'a', totalVideos: 10, completedCount: 10 },
        { courseId: 'b', totalVideos: 10, completedCount: 9, progressPercent: 100 },
        { courseId: 'c', totalVideos: 0, completedCount: 0 },
        { courseId: 'd', totalVideos: 5, completedCount: 5 },
      ] }) };
    } },
  };
  vm.createContext(c); vm.runInContext(statsSource, c);
  const stats = await c.learningStatsForUser('learner');
  assert.equal(stats.daysLearning, 2);
  assert.equal(stats.coursesDone, 2);
  assert.equal(stats.timezone, 'UTC');
});

test('new accounts receive zero counts and database failures remain errors', async () => {
  const c = { AnalyticsEvent: { distinct: async () => [] }, CourseProgress: { find: () => ({ select: () => ({ lean: async () => [] }) }) } };
  vm.createContext(c); vm.runInContext(statsSource, c);
  assert.equal((await c.learningStatsForUser('new')).daysLearning, 0);
  assert.equal((await c.learningStatsForUser('new')).coursesDone, 0);
  c.AnalyticsEvent.distinct = async () => { throw Error('Database offline'); };
  await assert.rejects(c.learningStatsForUser('new'), /offline/);
});

test('the statistics route requires authentication and rejects another account', async () => {
  const source = fs.readFileSync(require.resolve('../routes/mobileCompat'), 'utf8');
  const start = source.indexOf("router.get(\n  '/user/:id/learning-stats'");
  const end = source.indexOf('\nrouter.get(', start + 1);
  let handler, authOptions, requested;
  vm.runInNewContext(source.slice(start, end), {
    router: { get: (_path, _auth, fn) => { handler = fn; } },
    requireCompatibleAuth: options => { authOptions = options; return () => {}; }, asyncHandler: fn => fn,
    requireSameUser: (req, id) => { if (req.compatUser._id !== id) throw Error('Forbidden'); },
    learningStatsForUser: async id => { requested = id; return { daysLearning: 2, coursesDone: 1 }; },
  });
  assert.ok(authOptions.userIdNames.includes('id'));
  await assert.rejects(handler({ params: { id: 'other' }, compatUser: { _id: 'learner' } }, {}), /Forbidden/);
  assert.equal(requested, undefined);
  let body;
  await handler({ params: { id: 'learner' }, compatUser: { _id: 'learner' } }, { json: value => { body = value; } });
  assert.equal(body.daysLearning, 2);
  assert.equal(requested, 'learner');
});

function playbackFixture({ position = 0, intervals = [], elapsed = 5, priorSession = 'session' } = {}) {
  let now = Date.parse('2026-11-02T12:00:00Z');
  let row = { revision: 0, position, intervals, lastSeenAt: new Date(now - elapsed * 1000), sessionId: priorSession };
  const events = new Map();
  class TestDate extends Date { constructor(value) { super(value === undefined ? now : value); } static now() { return now; } }
  const c = {
    Date: TestDate, rules,
    access: async () => {}, context: async () => ({ version: 'v1', course: { _id: 'course', title: 'Course', videos: [{ _id: 'lesson' }] }, videos: [{ id: 'lesson', duration: 100 }] }),
    Learning: { findById: () => ({ lean: async () => row }), updateOne: async (_filter, update) => { row = { ...row, ...update.$set, revision: row.revision + 1 }; return { modifiedCount: 1 }; } },
    state: async () => ({ totalLessons: 1, completedLessons: 0 }), sync: async () => ({}), issue: async () => null,
    mongoose: { Types: { ObjectId: class { constructor(id) { this.id = id; } } } },
    AnalyticsEvent: { updateOne: async (filter, update) => { if (!events.has(filter._id.id)) events.set(filter._id.id, update.$setOnInsert); } },
    fail: message => Error(message),
  };
  const source = fs.readFileSync(require.resolve('../services/certificationService'), 'utf8');
  const fn = source.slice(source.indexOf('async function recordPlayback('), source.indexOf('\nasync function completeVideo('));
  vm.createContext(c); vm.runInContext(fn, c);
  return { c, events, setNow: value => { now = value; }, request: currentTime => c.recordPlayback({ user: { _id: 'learner' }, courseId: 'course', videoId: 'lesson', currentTime, duration: 100, sessionId: 'session' }) };
}

test('accepted playback records one learning day per account and UTC date', async () => {
  const f = playbackFixture();
  await f.request(5);
  f.setNow(Date.parse('2026-11-02T12:00:05Z'));
  await f.request(10);
  assert.equal([...f.events.values()].filter(event => event.event === 'learning_day').length, 1);
  f.setNow(Date.parse('2026-11-03T12:00:00Z'));
  await f.request(10); // Anchor after the long gap.
  f.setNow(Date.parse('2026-11-03T12:00:05Z'));
  await f.request(15);
  assert.equal([...f.events.values()].filter(event => event.event === 'learning_day').length, 2);
});

test('valid rewatching counts a day without adding duplicate coverage', async () => {
  const f = playbackFixture({ intervals: [[0, 100]] });
  await f.request(5);
  assert.ok([...f.events.values()].some(event => event.event === 'learning_day'));
});

test('seeks, long gaps and changed sessions do not count as learning activity', async () => {
  for (const [options, next] of [[{}, 90], [{ elapsed: 60 }, 5], [{ priorSession: 'other' }, 5]]) {
    const f = playbackFixture(options);
    await f.request(next);
    assert.equal([...f.events.values()].some(event => event.event === 'learning_day'), false);
  }
});
