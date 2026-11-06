const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const babel = require('@babel/core');
const { createProgressSaveQueue, PROGRESS_SAVE_ERROR } = require('../services/progressSaveQueue');
const source = require('node:fs').readFileSync(require.resolve('../App.js'), 'utf8');
const ast = babel.parseSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } });
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) {
    const match = find(child, predicate); if (match) return match;
  }
  return null;
}
const slice = node => source.slice(node.start, node.end);
function fixture(request) {
  const statuses = []; let progress = {};
  const c = { userRef: { current: { _id: 'learner', sessionId: 'session' } },
    useCallback: fn => fn, nativeSession: { requestJson: request },
    setCourseProgress: update => { progress = update(progress); }, setCertificates: () => {},
  };
  const queue = createProgressSaveQueue({ isCurrent: () => c.userRef.current?._id === 'learner', onChange: status => statuses.push(status) });
  c.progressSaveQueueRef = { current: queue };
  const save = find(ast, node => node.type === 'VariableDeclarator' && node.id?.name === 'saveVideoProgress');
  vm.createContext(c); vm.runInContext(`this.save = ${slice(save.init)}`, c);
  return { c, queue, statuses, progress: () => progress };
}

test('actual progress saver exposes a network failure then applies only the successful retry', async () => {
  let online = false; const bodies = [];
  const f = fixture(async (_url, options) => { bodies.push(JSON.parse(options.body)); if (!online) throw new Error('offline'); return { progress: { lastWatchedVideoId: 'lesson' } }; });
  await f.c.save('course', 'lesson', 25, 120);
  assert.equal(f.statuses.at(-1).count, 1); assert.deepEqual(f.progress(), {});
  online = true; await f.queue.retry();
  assert.equal(f.progress().course.lastWatchedVideoId, 'lesson');
  assert.deepEqual(bodies[0], bodies[1]); assert.equal(f.statuses.at(-1).count, 0);
});

test('legacy endpoint fallback remains available only for a missing modern route', async () => {
  for (const status of [404, 403, 500]) {
    const urls = [];
    const f = fixture(async url => { urls.push(url); if (urls.length === 1) throw Object.assign(new Error('failed'), { status }); return { progress: {} }; });
    await f.c.save('course', 'lesson', 30, 120);
    assert.equal(urls.length, status === 404 ? 2 : 1);
    if (status === 404) assert.equal(urls[1], '/api/user/progress/update-video');
    assert.equal(f.statuses.at(-1).count, status === 404 ? 0 : 1);
  }
});

test('switching accounts during a request cannot retry the legacy endpoint as the next user', async () => {
  let reject; const urls = [];
  const f = fixture(url => { urls.push(url); return new Promise((_resolve, no) => { reject = no; }); });
  const saving = f.c.save('course', 'lesson', 30, 120); await Promise.resolve();
  f.c.userRef.current = { _id: 'other', sessionId: 'other' };
  reject(Object.assign(new Error('missing'), { status: 404 })); await saving;
  assert.equal(urls.length, 1); assert.deepEqual(f.progress(), {}); assert.deepEqual(f.statuses, []);
});

test('warning renders readable feedback and an accessible retry button, disabled while saving', () => {
  const component = find(ast, node => node.type === 'FunctionDeclaration' && node.id?.name === 'ProgressSaveNotice');
  const code = babel.transformSync(slice(component), { configFile: false, babelrc: false,
    plugins: [require.resolve('@babel/plugin-transform-react-jsx')] }).code;
  const c = { React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    SafeAreaView: 'SafeAreaView', View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', PROGRESS_SAVE_ERROR };
  vm.createContext(c); vm.runInContext(code, c);
  assert.equal(c.ProgressSaveNotice({ count: 0 }), null);
  let retries = 0;
  for (const retrying of [false, true]) {
    const tree = c.ProgressSaveNotice({ count: 2, retrying, onRetry: () => retries++ });
    const button = find(tree, node => node.type === 'Button');
    assert.equal(button.props.accessibilityLabel, 'Retry saving lesson progress');
    assert.equal(button.props.disabled, retrying);
    assert.ok(JSON.stringify(tree).includes(PROGRESS_SAVE_ERROR));
    if (!retrying) button.props.onPress();
  }
  assert.equal(retries, 1);
});
