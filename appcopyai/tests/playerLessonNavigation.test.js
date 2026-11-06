const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');

const source = fs.readFileSync(require.resolve('../App.js'), 'utf8');
const ast = babel.parseSync(source, { babelrc: false, configFile: false, parserOpts: { plugins: ['jsx'] } });
const reels = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'ReelsScreen');
const slice = node => source.slice(node.start, node.end);
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const value of Object.values(node)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      const result = find(child, predicate);
      if (result) return result;
    }
  }
  return null;
}
function onPress(label) {
  const button = find(reels, node => node.type === 'JSXOpeningElement' && node.attributes.some(attr =>
    attr.name?.name === 'accessibilityLabel' && attr.value?.value === label));
  assert.ok(button, `Missing player button: ${label}`);
  return slice(button.attributes.find(attr => attr.name?.name === 'onPress').value.expression);
}

// Execute the callbacks bound to the actual player buttons, rather than copies
// of their behavior. No native player or billing service is invoked.
function fixture(activeIndex = 23) {
  const scrolls = [];
  const context = {
    showNotes: true, showLectures: false, showCourseAi: true,
    showDescription: true, playerSettingsOpen: true, activeIndex, lecturePage: 0,
    lecturePageSize: 20, videos: Array.from({ length: 34 }, (_, i) => ({ _id: String(i) })),
    useCallback: fn => fn,
    flatListRef: { current: { scrollToIndex: args => scrolls.push(args.index) } },
    closeCourseAi: () => { context.showCourseAi = false; },
  };
  for (const [setter, key] of [
    ['setShowNotes', 'showNotes'], ['setShowLectures', 'showLectures'],
    ['setShowDescription', 'showDescription'], ['setPlayerSettingsOpen', 'playerSettingsOpen'],
    ['setLecturePage', 'lecturePage'], ['setActiveIndex', 'activeIndex'],
  ]) context[setter] = value => { context[key] = value; };
  const callbacks = ['openLecturePicker', 'openLectureNotes'].map(name => slice(
    reels.body.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === name),
  ));
  const goToLecture = reels.body.body.find(node => node.type === 'VariableDeclaration'
    && node.declarations.some(declaration => declaration.id.name === 'goToLecture'));
  vm.createContext(context);
  vm.runInContext(`${callbacks.join('\n')}\n${slice(goToLecture)}\nthis.actions = {
    lectures: ${onPress('Open course lectures')},
    notes: ${onPress('Open lecture notes and prompts')},
    select: goToLecture,
  };`, context);
  return { context, scrolls, actions: context.actions };
}

test('Lectures opens the picker on the active lecture page and closes other sheets', () => {
  const { actions, context } = fixture();
  actions.lectures();
  assert.equal(context.showLectures, true);
  assert.equal(context.showNotes, false);
  assert.equal(context.showCourseAi, false);
  assert.equal(context.showDescription, false);
  assert.equal(context.playerSettingsOpen, false);
  assert.equal(context.lecturePage, 1);
});

test('Notes opens notes rather than the picker, including after Lectures was opened', () => {
  const { actions, context } = fixture();
  actions.lectures();
  actions.notes();
  assert.equal(context.showNotes, true);
  assert.equal(context.showLectures, false);
});

test('a lecture selection closes the picker and scrolls to the requested lesson', () => {
  const { actions, context, scrolls } = fixture();
  actions.lectures();
  actions.select(5);
  assert.equal(context.activeIndex, 5);
  assert.equal(context.showLectures, false);
  assert.equal(context.showNotes, false);
  assert.deepEqual(scrolls, [5]);
});

test('invalid lesson selections cannot navigate away or close the picker', () => {
  const { actions, context, scrolls } = fixture(0);
  actions.lectures();
  assert.equal(context.lecturePage, 0);
  for (const index of [-1, 34, 1.5, NaN, undefined]) actions.select(index);
  assert.equal(context.activeIndex, 0);
  assert.equal(context.showLectures, true);
  assert.deepEqual(scrolls, []);
});

test('failed lesson questions can be retried with their original text', () => {
  const declaration = reels.body.body.find(node => node.type === 'VariableDeclaration'
    && node.declarations.some(item => item.id.name === 'retryCourseAiQuestion'));
  const sent = [];
  const context = {
    courseAiMessages: [
      { role: 'assistant', content: 'Welcome' },
      { role: 'user', content: 'Summarize this video' },
      { role: 'assistant', content: 'Unavailable', failed: true },
    ],
    sendCourseAiMessage: question => sent.push(question),
  };
  vm.createContext(context);
  vm.runInContext(`${slice(declaration)}\n(${onPress('Retry lesson question')})();`, context);
  assert.deepEqual(sent, ['Summarize this video']);
});

test('successful answers and fresh lesson chats do not offer a failed-question retry', () => {
  const declaration = reels.body.body.find(node => node.type === 'VariableDeclaration'
    && node.declarations.some(item => item.id.name === 'retryCourseAiQuestion'));
  for (const courseAiMessages of [[], [{ role: 'assistant', content: 'Welcome' }], [
    { role: 'user', content: 'Summarize this video' }, { role: 'assistant', content: 'Summary' },
  ]]) {
    const context = { courseAiMessages };
    vm.createContext(context);
    vm.runInContext(`${slice(declaration)}\nthis.retry = retryCourseAiQuestion;`, context);
    assert.equal(context.retry, null);
  }
});
