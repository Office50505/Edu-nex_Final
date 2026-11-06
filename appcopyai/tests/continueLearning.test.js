const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');
const source = fs.readFileSync(require.resolve('../App.js'), 'utf8');
const ast = babel.parseSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } });
const home = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'HomeScreen');
const slice = node => source.slice(node.start, node.end);
const declaration = name => home.body.body.find(node => node.type === 'VariableDeclaration'
  && node.declarations.some(item => item.id.name === name));
const helpers = ['finiteSeconds', 'clampSeconds', 'parseDurationSeconds', 'getVideoKnownDuration', 'normalizeResumeTime',
  'getVideoKey', 'getResumeInfo', 'getCourseProgressPercent'].map(name => slice(ast.program.body.find(node =>
  node.type === 'FunctionDeclaration' && node.id.name === name))).join('\n');
const makeCourse = (id, count) => ({ _id: id, title: id, videos: Array.from({ length: count }, (_, i) =>
  ({ _id: `${id}-${i}`, title: `Lesson ${i + 1}`, duration: 120, order: i })) });
const influencer = makeCourse('AI Influencer', 34);
const viral = makeCourse('Viral Hook', 10);

function fixture(courses, progress) {
  const c = { homeCourses: courses, courseProgress: progress, sortLessons: lessons => [...lessons],
    RESUME_RESTART_REMAINING_SECONDS: 3, RESUME_RESTART_FRACTION: 0.985,
    useMemo: fn => fn(), useCallback: fn => fn,
  };
  vm.createContext(c);
  vm.runInContext(`${helpers}\n${slice(declaration('homeCourseSummaries'))}\n${slice(declaration('continueSummaries'))}
    this.summaries = homeCourseSummaries; this.cards = continueSummaries;`, c);
  return c;
}

test('Viral Hook with resume-only activity appears before the untouched Influencer course', () => {
  const c = fixture([influencer, viral], { [viral._id]: {
    updatedAt: '2026-11-02T12:00:00Z', videoProgress: { 'Viral Hook-0': { resumePosition: 35 } },
  } });
  assert.equal(c.cards[0].course._id, viral._id);
  assert.equal(c.cards[0].isStarted, true);
  assert.equal(c.cards[0].resume.seconds, 35);
  assert.equal(c.cards[0].resumeLesson.title, 'Lesson 1');
});

test('the most recently watched unfinished course wins over catalogue order and lesson count', () => {
  const c = fixture([influencer, viral], {
    [influencer._id]: { updatedAt: '2026-11-01', lastWatchedVideoId: 'AI Influencer-0' },
    [viral._id]: { updatedAt: '2026-11-02', lastWatchedVideoId: 'Viral Hook-2' },
  });
  assert.equal(c.cards[0].course._id, viral._id);
  assert.equal(c.cards[0].resume.index, 2);
});

test('partial progress and completed IDs count even before lesson metadata is loaded', () => {
  for (const progress of [{ progressPercent: 5 }, { completedVideoIds: ['saved-lesson'] }]) {
    const c = fixture([influencer, { _id: 'recent', title: 'Recent course', lessonCount: 10 }], {
      recent: { ...progress, updatedAt: '2026-11-02' },
    });
    assert.equal(c.cards[0].course._id, 'recent');
    assert.equal(c.cards[0].isStarted, true);
  }
});

test('resume returns to the last watched lesson even when earlier lessons are unfinished', () => {
  const c = fixture([viral], { [viral._id]: {
    lastWatchedVideoId: 'Viral Hook-4', videoProgress: { 'Viral Hook-4': { resumePosition: 42, duration: 120 } },
  } });
  assert.equal(c.cards[0].resume.index, 4);
  assert.equal(c.cards[0].resume.seconds, 42);
});

test('after finishing the last watched lesson, resume advances to the next unfinished lesson', () => {
  const c = fixture([viral], { [viral._id]: { lastWatchedVideoId: 'Viral Hook-4', completedVideoIds: ['Viral Hook-4'] } });
  assert.equal(c.cards[0].resume.index, 5);
  assert.equal(c.cards[0].resume.seconds, 0);
});

test('invalid timestamps cannot stop a valid recent course from reaching the top', () => {
  const c = fixture([influencer, viral], {
    [influencer._id]: { updatedAt: 'invalid', lastWatchedVideoId: 'AI Influencer-0' },
    [viral._id]: { updatedAt: '2026-11-02', lastWatchedVideoId: 'Viral Hook-0' },
  });
  assert.equal(c.cards[0].course._id, viral._id);
});

test('pressing Continue resumes the displayed course, lesson and position', () => {
  const c = fixture([influencer, viral], { [viral._id]: {
    lastWatchedVideoId: 'Viral Hook-3', videoProgress: { 'Viral Hook-3': { resumePosition: 27 } },
  } });
  const calls = [];
  Object.assign(c, { course: influencer, lessons: influencer.videos, isComplete: false, resume: { index: 0, seconds: 0 },
    requireAccess: fn => fn(), onResumeCourse: (...args) => calls.push(args), onSelectCourse() { assert.fail('Unexpected course fallback'); },
  });
  vm.runInContext(`${slice(declaration('continueCourse'))}\ncontinueCourse(cards[0]);`, c);
  assert.equal(calls[0][0]._id, viral._id);
  assert.equal(calls[0][1], 3);
  assert.equal(calls[0][2], 27);
});

test('completed courses do not displace unfinished study and still allow review', () => {
  const c = fixture([influencer, viral], {
    [influencer._id]: { lastWatchedVideoId: 'AI Influencer-0', updatedAt: '2026-11-01' },
    [viral._id]: { progressPercent: 100, updatedAt: '2026-11-02', completedVideoIds: viral.videos.map(v => v._id) },
  });
  assert.equal(c.cards[0].course._id, influencer._id);
  assert.equal(c.summaries.find(item => item.course._id === viral._id).isComplete, true);
});
