const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');

const source = fs.readFileSync(require.resolve('../App.js'), 'utf8');
const ast = babel.parseSync(source, { babelrc: false, configFile: false, parserOpts: { plugins: ['jsx'] } });
const reels = ast.program.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === 'ReelsScreen');
const video = ast.program.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === 'VideoItem');
const slice = n => source.slice(n.start, n.end);
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return null;
}

const render = find(reels, n => n.type === 'JSXAttribute' && n.name.name === 'renderItem').value.expression;
const renderCode = babel.transformSync(`this.renderCell = ${slice(render)};`, {
  babelrc: false, configFile: false, plugins: [require.resolve('@babel/plugin-transform-react-jsx')],
}).code;

function cell(index, overrides = {}) {
  const c = {
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    View: 'View', VideoItem: 'VideoItem', Animated: { View: 'AnimatedView' },
    SafeAreaView: 'SafeAreaView', TouchableOpacity: 'TouchableOpacity',
    Text: 'Text', Ionicons: 'Icon', LessonDownloadButton: 'DownloadButton',
    activeIndex: 1, videos: [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }],
    course: { title: 'Course' }, courseId: 'course', user: {}, downloads: {}, s: {}, C: {},
    reelFrameHeight: 800, videoUiOverlayOpen: false, playerChromeHidden: false,
    renderWebPlayerChrome: true, playerSettingsOpen: false,
    webPlayerChromeAnimatedStyle: {}, initialIndex: 0, initialTime: 0,
    getVideoDescription: () => 'Description', plainCourseDescription: v => v,
    getDownloadId: v => v._id,
    onBack() {}, onDownloadVideo() {}, openLectureNotes() {}, openLecturePicker() {},
    ...overrides,
  };
  vm.createContext(c);
  vm.runInContext(renderCode, c);
  return c.renderCell({ item: { _id: String(index), title: 'Lesson' }, index });
}

function exposedLabels(node, hidden = false) {
  if (!node || typeof node !== 'object') return [];
  const props = node.props || {};
  hidden ||= props.accessibilityElementsHidden === true || props.importantForAccessibility === 'no-hide-descendants';
  if (hidden) return [];
  return [props.accessibilityLabel, ...(props.children || []).flat(Infinity).flatMap(child => exposedLabels(child))].filter(Boolean);
}

test('iOS and Android hide every cached inactive lesson cell from accessibility', () => {
  for (const index of [0, 2]) {
    const tree = cell(index);
    assert.equal(tree.props.accessibilityElementsHidden, true);
    assert.equal(tree.props.importantForAccessibility, 'no-hide-descendants');
    assert.deepEqual(exposedLabels(tree), []);
  }
});

test('the current lesson retains independently accessible controls', () => {
  const tree = cell(1);
  assert.equal(tree.props.accessibilityElementsHidden, false);
  assert.equal(tree.props.importantForAccessibility, 'auto');
  assert.ok(exposedLabels(tree).includes('Open course lectures'));
  assert.ok(exposedLabels(tree).includes('Open lesson information. Lesson'));
});

test('changing lessons moves accessibility exposure to the new cell only', () => {
  for (const activeIndex of [0, 2, 1]) {
    const visible = [0, 1, 2].filter(index => exposedLabels(cell(index, { activeIndex })).length > 0);
    assert.deepEqual(visible, [activeIndex]);
  }
});

test('opening a sheet hides the underlying video cell from accessibility', () => {
  const tree = cell(1, { videoUiOverlayOpen: true });
  assert.equal(tree.props.accessibilityElementsHidden, true);
  assert.deepEqual(exposedLabels(tree), []);
});

test('hidden chrome removes top, side and description controls from the iOS accessibility tree', () => {
  const tree = cell(1, { playerChromeHidden: true });
  const wrapper = tree.props.children[0];
  const chrome = wrapper.props.children.flat(Infinity).filter(n => n?.type === 'AnimatedView');
  assert.equal(chrome.length, 3);
  for (const region of chrome) assert.equal(region.props.accessibilityElementsHidden, true);
  assert.deepEqual(exposedLabels(tree), []);
});

const chromeGuard = find(video, n => n.type === 'LogicalExpression' && n.right.type === 'JSXElement'
  && n.right.openingElement.name.type === 'JSXMemberExpression'
  && n.right.openingElement.name.object.name === 'Animated'
  && n.right.openingElement.attributes.some(a => a.name?.name === 'renderToHardwareTextureAndroid'));

test('inactive or suspended videos do not mount their playback controls or stale settings', () => {
  assert.ok(chromeGuard);
  for (const showLiveSurface of [false, true]) {
    const rendered = vm.runInNewContext(slice(chromeGuard.left), { showLiveSurface, renderPlayerChrome: true });
    assert.equal(rendered, showLiveSurface);
  }
});

test('leaving a video closes its settings so returning cannot reopen an old panel', () => {
  const effect = video.body.body.map(n => n.expression).find(n => n?.callee?.name === 'useEffect'
    && n.arguments[1]?.elements?.some(e => e.name === 'isActive')
    && slice(n.arguments[0]).includes('setShowSettings(false)'));
  assert.ok(effect, 'Settings must close when the video becomes inactive');
  let settings = true;
  for (const [isActive, expected] of [[true, true], [false, false], [true, false]]) {
    vm.runInNewContext(`(${slice(effect.arguments[0])})()`, {
      isActive, setShowSettings: value => { settings = value; },
    });
    assert.equal(settings, expected);
  }
  assert.equal(settings, false);
});
