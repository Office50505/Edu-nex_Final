const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');
const source = fs.readFileSync(require.resolve('../App.js'), 'utf8');
const ast = babel.parseSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } });
const screen = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'CourseListScreen');
const slice = node => source.slice(node.start, node.end);
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return null;
}
const load = screen.body.body.find(node => node.type === 'VariableDeclaration'
  && node.declarations.some(declaration => declaration.id.name === 'loadCourses'));
const functions = ['readJsonResponse', 'fetchApiJson'].map(name => slice(ast.program.body.find(node =>
  node.type === 'FunctionDeclaration' && node.id.name === name))).join('\n');
const response = (data, ok = true, status = 200) => ({ ok, status, text: async () => JSON.stringify(data) });
const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
const pendingUntilAbort = signal => new Promise((_, reject) => {
  if (signal.aborted) reject(abortError());
  else signal.addEventListener('abort', () => reject(abortError()), { once: true });
});

function fixture(fetcher, cached = null) {
  const state = { courses: cached || [], loading: !cached, refreshing: false, error: null };
  const deadlines = [];
  const c = {
    fetch: fetcher, API_BASE: 'https://api.example.test', AbortController,
    setTimeout: (fn, ms) => { deadlines.push(ms); return setTimeout(fn, 20); }, clearTimeout,
    courseListCache: cached, courseRequestRef: { current: null }, DEV_UI_QA_ENABLED: false,
    useCallback: fn => fn,
  };
  for (const field of Object.keys(state)) c[`set${field[0].toUpperCase()}${field.slice(1)}`] = value => { state[field] = value; };
  vm.createContext(c);
  vm.runInContext(`${functions}\n${slice(load)}\nthis.load = loadCourses;`, c);
  return { c, state, deadlines };
}

test('a hung catalogue request exits loading with a timeout message', async () => {
  const f = fixture((_url, options) => pendingUntilAbort(options.signal));
  await f.c.load();
  assert.equal(f.state.loading, false);
  assert.equal(f.state.refreshing, false);
  assert.match(f.state.error, /took too long/);
  assert.deepEqual(f.deadlines, [15000]);
});

test('the deadline also covers a response body that stalls after headers', async () => {
  const f = fixture(async (_url, { signal }) => ({ ok: true, text: () => pendingUntilAbort(signal) }));
  await f.c.load();
  assert.equal(f.state.loading, false);
  assert.match(f.state.error, /took too long/);
});

test('Retry can recover after a timed-out initial request', async () => {
  const f = fixture((_url, options) => pendingUntilAbort(options.signal));
  await f.c.load();
  f.c.fetch = async () => response([{ _id: 'recovered', title: 'Creator Basics' }]);
  await f.c.load();
  assert.equal(f.state.error, null);
  assert.equal(f.state.courses[0]._id, 'recovered');
  assert.equal(f.c.courseListCache[0]._id, 'recovered');
  assert.equal(f.state.loading, false);
});

test('HTTP errors and invalid payloads show a retryable error instead of poisoning the cache', async () => {
  for (const result of [response({ error: 'private proxy details' }, false, 503), response({}), response(null)]) {
    const f = fixture(async () => result);
    await f.c.load();
    assert.equal(f.c.courseListCache, null);
    assert.match(f.state.error, /Check your connection/);
    assert.doesNotMatch(f.state.error, /private proxy details/);
    assert.equal(f.state.loading, false);
  }
});

test('a failed pull-to-refresh preserves usable cached courses and stops refreshing', async () => {
  const cached = [{ _id: 'cached' }];
  const f = fixture(async () => { throw new TypeError('Network failed'); }, cached);
  await f.c.load({ refresh: true });
  assert.equal(f.state.courses, cached);
  assert.equal(f.c.courseListCache, cached);
  assert.equal(f.state.refreshing, false);
  assert.match(f.state.error, /could not be loaded/);
});

test('a superseded response cannot replace newer courses or reset their loading state', async () => {
  let resolveOld;
  const f = fixture(() => new Promise(resolve => { resolveOld = resolve; }));
  const old = f.c.load();
  f.c.fetch = async () => response([{ _id: 'new' }]);
  await f.c.load({ refresh: true });
  resolveOld(response([{ _id: 'stale' }]));
  await old;
  assert.equal(f.state.courses[0]._id, 'new');
  assert.equal(f.c.courseListCache[0]._id, 'new');
  assert.equal(f.state.error, null);
});

test('unmount cancels the pending request and ignores its late failure', async () => {
  const f = fixture((_url, options) => pendingUntilAbort(options.signal));
  const effect = screen.body.body.find(node => node.type === 'ExpressionStatement'
    && node.expression.callee?.name === 'useEffect'
    && node.expression.arguments[1]?.elements?.some(element => element.name === 'loadCourses'));
  f.c.loadCourses = f.c.load;
  const cleanup = vm.runInContext(`(${slice(effect.expression.arguments[0])})()`, f.c);
  cleanup();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.c.courseRequestRef.current, null);
  assert.equal(f.state.error, null);
});

test('both initial failure and cached-refresh failure expose working Retry actions', () => {
  for (const [label, callback] of [['Retry loading courses', 'loadCourses'], ['Retry refreshing courses', 'refreshCourses']]) {
    const button = find(screen, node => node.type === 'JSXOpeningElement' && node.attributes.some(attr =>
      attr.name?.name === 'accessibilityLabel' && attr.value?.value === label));
    assert.ok(button, label);
    const handler = button.attributes.find(attr => attr.name?.name === 'onPress').value.expression;
    let called = 0;
    vm.runInNewContext(`(${slice(handler)})()`, { [callback]: () => called++ });
    assert.equal(called, 1);
  }
});
