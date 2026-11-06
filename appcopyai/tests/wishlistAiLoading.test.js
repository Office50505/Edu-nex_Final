const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const babel = require('@babel/core');
const source = require('node:fs').readFileSync(require.resolve('../App.js'), 'utf8');
const ast = babel.parseSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } });
const slice = node => source.slice(node.start, node.end);
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) {
    const match = find(child, predicate); if (match) return match;
  }
  return null;
}
const functions = ['readJsonResponse', 'fetchApiJson'].map(name => slice(ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === name))).join('\n');
function effectFor(name, marker) {
  const screen = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === name);
  return find(screen, node => node.type === 'CallExpression' && node.callee?.name === 'useEffect'
    && slice(node.arguments[0]).includes(marker)).arguments[0];
}
const wishlistEffect = effectFor('WishlistScreen', 'fetchApiJson');
const aiEffect = effectFor('AiAssistantScreen', 'fetchApiJson');
const response = (data, ok = true, status = 200) => ({ ok, status, text: async () => JSON.stringify(data) });
const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
const pendingUntilAbort = signal => new Promise((_, reject) => {
  if (signal.aborted) reject(abortError()); else signal.addEventListener('abort', () => reject(abortError()), { once: true });
});
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(kind, fetcher, overrides = {}) {
  const deadlines = [];
  const c = { API_BASE: 'https://api.test', AbortController, fetch: fetcher,
    setTimeout: (fn, ms) => { deadlines.push(ms); return setTimeout(fn, 20); }, clearTimeout,
    wishlist: ['saved'], courses: [], loading: true, wishlistError: '', wishlistAttempt: 0, DEV_UI_QA_ENABLED: false,
    AI_FEATURE_ENABLED: true, user: { _id: 'learner', sessionId: 'session' }, isCourseMode: false, isRootTabActive: true,
    status: 'checking', availabilityError: '', availabilityAttempt: 0, courseId: null, courseName: '', courseScopeReady: false,
    fixedCourse: { _id: 'saved', title: 'Saved course' },
    findIndexedAiCourse: (course, courses) => courses.find(item => item._id === course._id), formatAiCourseName: course => course.title,
    ...overrides,
  };
  for (const key of ['courses', 'loading', 'wishlistError', 'wishlistAttempt', 'status', 'availabilityError', 'availabilityAttempt', 'courseId', 'courseName', 'courseScopeReady']) {
    c[`set${key[0].toUpperCase()}${key.slice(1)}`] = value => { c[key] = typeof value === 'function' ? value(c[key]) : value; };
  }
  vm.createContext(c); vm.runInContext(functions, c);
  const effect = kind === 'wishlist' ? wishlistEffect : aiEffect;
  return { c, deadlines, run: () => vm.runInContext(`(${slice(effect)})()`, c) };
}

test('Wishlist times out both stalled connections and stalled response bodies with a visible error', async () => {
  for (const fetcher of [(_url, { signal }) => pendingUntilAbort(signal),
    async (_url, { signal }) => ({ ok: true, text: () => pendingUntilAbort(signal) })]) {
    const f = fixture('wishlist', fetcher); f.run(); await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(f.c.loading, false); assert.match(f.c.wishlistError, /took too long/); assert.deepEqual(f.deadlines, [15000]);
  }
});

test('Wishlist errors and malformed responses cannot be presented as an empty saved list', async () => {
  for (const data of [response({}, true), response({ error: 'private server details' }, false, 503)]) {
    const f = fixture('wishlist', async () => data); f.run(); await settle();
    assert.equal(f.c.loading, false); assert.match(f.c.wishlistError, /could not be loaded/);
    assert.doesNotMatch(f.c.wishlistError, /private server/);
  }
});

test('Wishlist Retry recovers and an empty wishlist clears old courses without fetching', async () => {
  const f = fixture('wishlist', async () => { throw new Error('offline'); });
  const cleanup = f.run(); await settle(); assert.ok(f.c.wishlistError); cleanup();
  f.c.fetch = async () => response([{ _id: 'saved' }, { _id: 'other' }]);
  const cleanupRetry = f.run(); await settle();
  assert.equal(f.c.wishlistError, ''); assert.equal(f.c.courses.length, 1); assert.equal(f.c.courses[0]._id, 'saved'); cleanupRetry();
  f.c.wishlist = []; f.c.fetch = () => assert.fail('An empty wishlist needs no request'); f.run();
  assert.equal(f.c.courses.length, 0); assert.equal(f.c.loading, false);
});

test('leaving Wishlist aborts its request and ignores a late response', async () => {
  let resolve, signal;
  const f = fixture('wishlist', (_url, options) => { signal = options.signal; return new Promise(done => { resolve = done; }); });
  const cleanup = f.run(); cleanup(); assert.equal(signal.aborted, true);
  resolve(response([{ _id: 'saved' }])); await settle(); assert.equal(f.c.courses.length, 0); assert.equal(f.c.wishlistError, '');
});

test('AI availability exits checking when either request hangs and cancels the other request', async () => {
  for (const stalled of ['/api/health/db', '/api/courses']) {
    const f = fixture('ai', (url, { signal }) => url.endsWith(stalled) ? pendingUntilAbort(signal)
      : Promise.resolve(response(url.endsWith('/api/courses') ? [] : { ok: true })));
    f.run(); await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(f.c.status, 'offline'); assert.match(f.c.availabilityError, /took too long/);
    assert.deepEqual(f.deadlines, [15000, 15000]);
  }
});

test('AI rejects unhealthy and malformed responses and Retry can recover course scope', async () => {
  for (const [health, courses] of [[{ ok: false }, []], [{ ok: true }, {}]]) {
    const f = fixture('ai', async url => response(url.endsWith('/api/courses') ? courses : health), { isCourseMode: true });
    const cleanup = f.run(); await settle(); assert.equal(f.c.status, 'offline'); assert.ok(f.c.availabilityError); cleanup();
    f.c.fetch = async url => response(url.endsWith('/api/courses') ? [{ _id: 'saved', title: 'Saved course' }] : { ok: true });
    f.run(); await settle(); assert.equal(f.c.status, 'online'); assert.equal(f.c.availabilityError, '');
    assert.equal(f.c.courseId, 'saved'); assert.equal(f.c.courseScopeReady, true);
  }
});

test('AI distinguishes a course without indexed lessons from a network failure', async () => {
  const f = fixture('ai', async url => response(url.endsWith('/api/courses') ? [] : { ok: true }), { isCourseMode: true });
  f.run(); await settle(); assert.match(f.c.availabilityError, /lesson material is not ready/); assert.equal(f.c.courseScopeReady, false);
});

test('AI cleanup aborts both checks and ignores late responses after navigation or account changes', async () => {
  const resolves = [], signals = [];
  const f = fixture('ai', (_url, { signal }) => { signals.push(signal); return new Promise(done => resolves.push(done)); });
  const cleanup = f.run(); cleanup(); assert.ok(signals.every(signal => signal.aborted));
  resolves[0](response({ ok: true })); resolves[1](response([])); await settle();
  assert.equal(f.c.status, 'checking'); assert.equal(f.c.availabilityError, '');
});

test('visible Retry buttons trigger fresh Wishlist and AI checks', () => {
  for (const [screenName, setter] of [['WishlistScreen', 'setWishlistAttempt'], ['AiAssistantScreen', 'setAvailabilityAttempt']]) {
    const screen = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === screenName);
    const attribute = find(screen, node => node.type === 'JSXAttribute' && node.name?.name === 'onPress'
      && node.value?.expression && slice(node.value.expression).includes(`${setter}(`));
    assert.ok(attribute); let attempt = 0;
    vm.runInNewContext(`(${slice(attribute.value.expression)})()`, { [setter]: update => { attempt = update(attempt); } });
    assert.equal(attempt, 1);
  }
});
