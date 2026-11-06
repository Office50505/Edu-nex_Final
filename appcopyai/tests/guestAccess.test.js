const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');
const source = fs.readFileSync(require.resolve('../App.js'), 'utf8');
const ast = babel.parseSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } });
const app = ast.program.body.find(n => n.type === 'ExportDefaultDeclaration').declaration;
const slice = n => source.slice(n.start, n.end);
const fn = name => slice(ast.program.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === name));
const declaration = name => app.body.body.find(n => n.type === 'VariableDeclaration' && n.declarations.some(d => d.id.name === name));
function fixture(user = null, response = null) {
  const c = { userRef: { current: user }, user, useCallback: fn => fn, hasCourseAccess: u => u?.paid === true,
    requestCourseVideos: async (_session, _user, id) => { c.requests.push(id); return response || { videos: [{ _id: 'intro', order: 1, publicPlayback: true }, { _id: 'paid', order: 2, locked: true }] }; },
    requests: [], nativeSession: {}, DEV_UI_QA_ENABLED: false,
    courseReturnRouteRef: { current: null }, currentRouteRef: { current: null },
    courseOpenRequestRef: { current: 0 }, courseOpenRetryRef: { current: null },
    sortLessons: videos => [...videos], getVideoKey: video => video._id,
  };
  for (const name of ['ShowAppUpgrade', 'AiActiveCourseHint', 'SelectedCourse', 'CourseOpenStatus', 'PreloadedVideos', 'IsPreviewOnly', 'InitialTime', 'StartIndex', 'MainScreen']) {
    c[`set${name}`] = value => { c[name] = value; };
  }
  vm.createContext(c); vm.runInContext(`${slice(declaration('openCourse'))}\nthis.open = openCourse;`, c);
  return c;
}
test('a guest opens course details and can play public lessons without a session', async () => {
  for (const user of [null, { _id: 'non-member', sessionId: 'session' }]) {
    const c = fixture(user);
    assert.equal(await c.open({ _id: 'course' }, { startIndex: 0 }), true);
    assert.equal(c.MainScreen, 'courses'); assert.equal(c.StartIndex, 0);
    assert.equal(c.PreloadedVideos.length, 1); assert.equal(c.IsPreviewOnly, true);
    assert.equal(c.ShowAppUpgrade, undefined);
  }
});
test('a direct link to a paid lesson opens details rather than starting a different free video', async () => {
  const c = fixture(); await c.open({ _id: 'course' }, { startIndex: 1 });
  assert.equal(c.StartIndex, null); assert.equal(c.SelectedCourse.videos[1].locked, true);
});
test('a guest never trusts members-only videos cached in a home card', async () => {
  const c = fixture(); await c.open({ _id: 'course', __homePlayableVideos: true, videos: [{ _id: 'paid-url' }] });
  assert.equal(c.requests.length, 1); assert.equal(c.SelectedCourse.videos[0]._id, 'intro');
});
test('a late public response cannot replace the new signed-in account view', async () => {
  let resolve; const c = fixture(); c.requestCourseVideos = () => new Promise(done => { resolve = done; });
  const opening = c.open({ _id: 'course' }); c.userRef.current = { _id: 'account', sessionId: 'session' };
  resolve({ videos: [{ _id: 'intro' }] }); assert.equal(await opening, false);
  assert.equal(c.CourseOpenStatus.loading, true); // No late state publication.
});
test('course data uses public requests for guests and non-members; paid accounts retain session refresh', async () => {
  const paths = []; const c = { hasCourseAccess: u => u?.paid === true, fetchApiJson: async path => paths.push(['public', path]) };
  vm.createContext(c); vm.runInContext(fn('requestCourseVideos'), c);
  const session = { requestJson: async path => paths.push(['private', path]) };
  await c.requestCourseVideos(session, null, 'course');
  await c.requestCourseVideos(session, { _id: 'member' }, 'course');
  await c.requestCourseVideos(session, { _id: 'member', paid: true }, 'course');
  assert.deepEqual(paths, [['public', '/api/public/courses/course/videos'], ['public', '/api/public/courses/course/videos'], ['private', '/api/courses/course/videos']]);
});
test('public CloudFront authorization sends no personal identity or bearer credentials', async () => {
  const requests = []; const c = { API_BASE: 'https://api.test', AbortController, setTimeout, clearTimeout, PLAYBACK_ACCESS_TIMEOUT_MS: 1000,
    authHeadersForUser: (user, headers) => ({ ...headers, ...(user ? { Authorization: 'Bearer token' } : {}) }),
    fetch: async (url, options) => { requests.push({ url, options }); return { ok: true, text: async () => JSON.stringify({ hlsUrl: '/play.m3u8' }) }; } };
  vm.createContext(c); vm.runInContext(fn('fetchPlaybackLease'), c);
  await c.fetchPlaybackLease({ courseId: 'course', video: { _id: 'intro', publicPlayback: true }, user: { _id: 'account', sessionId: 'session', accessToken: 'token' } });
  assert.match(requests[0].url, /\/api\/public\/courses\/course\/videos\/intro\/playback-access$/);
  assert.equal(requests[0].options.body, '{}'); assert.equal(requests[0].options.headers.Authorization, undefined);
});
test('fresh installs default to browsing and authentication remains explicitly dismissible', () => {
  const initialAuth = app.body.body.find(n => n.type === 'VariableDeclaration' && n.declarations.some(d => d.id.type === 'ArrayPattern' && d.id.elements[0]?.name === 'showAuth')).declarations[0].init;
  assert.equal(initialAuth.arguments[0].value, false);
  const gate = app.body.body.find(n => n.type === 'IfStatement' && slice(n.test) === '!user && showAuth');
  assert.ok(gate); assert.match(slice(gate), /Continue as Guest/);
  const home = ast.program.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === 'HomeScreen');
  const list = ast.program.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === 'CourseListScreen');
  assert.doesNotMatch(slice(home) + slice(list), /user\.avatar/);
});

function renderApp(overrides = {}) {
  const isolated = babel.parseSync(slice(app), { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } });
  const globals = new Set();
  babel.traverse(isolated, { ReferencedIdentifier(path) { if (!path.scope.hasBinding(path.node.name)) globals.add(path.node.name); } });
  const c = Object.fromEntries([...globals].map(name => [name, () => {}]));
  let stateIndex = 0;
  const states = app.body.body.filter(n => n.type === 'VariableDeclaration').flatMap(n => n.declarations)
    .filter(d => d.init?.callee?.name === 'useState').map(d => d.id.elements[0]?.name);
  Object.assign(c, {
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    useState: initial => { const name = states[stateIndex++]; return [Object.hasOwn(overrides, name) ? overrides[name] : name === 'isRestoring' ? false : typeof initial === 'function' ? initial() : initial, () => {}]; },
    useRef: value => ({ current: value }), useCallback: fn => fn, useMemo: fn => fn(), useEffect() {},
    useWindowDimensions: () => ({ width: 390 }), useColorScheme: () => 'dark',
    createNativeSession: () => ({ setUser() {}, requestJson: async () => assert.fail('Rendering guest pages must not call private APIs') }),
    useAppleSubscriptions: () => ({}), useGooglePlaySubscriptions: () => ({}),
    Platform: { OS: 'ios' }, ROOT_TAB_ORDER: ['home', 'courses', 'ai', 'downloads'],
    homeCatalogCourses: null, DEV_UI_QA_ENABLED: false, C: {}, s: {},
    hasCourseAccess: () => false, buildCourseSearchReferences: () => [],
    AppSearchReferencesContext: { Provider: 'SearchProvider' },
  });
  const compiled = babel.transformSync(slice(app), { configFile: false, babelrc: false, plugins: [require.resolve('@babel/plugin-transform-react-jsx')] }).code;
  vm.createContext(c); vm.runInContext(`${compiled}\nthis.tree = App();`, c);
  function find(node, type) {
    if (!node || typeof node !== 'object') return null;
    if (node.type === type) return node;
    for (const child of node.props?.children?.flat(Infinity) || []) { const result = find(child, type); if (result) return result; }
    return null;
  }
  return { c, find: type => find(c.tree, c[type]) };
}
test('the actual app renders guest Home and course navigation without showing authentication', () => {
  const f = renderApp(); const tabs = f.find('SwipeableRootTabs');
  assert.ok(tabs); assert.equal(tabs.props.activeTab, 'home');
  assert.equal(tabs.props.renderTab('home').props.children[0].type, f.c.HomeScreen);
  assert.equal(tabs.props.renderTab('courses').type, f.c.CourseListScreen);
  assert.equal(tabs.props.renderTab('downloads').type, f.c.GuestAccountScreen);
  assert.equal(tabs.props.renderTab('ai').type, f.c.GuestAccountScreen);
});
test('the actual guest profile is an optional account page and login has a guest exit', () => {
  const profile = renderApp({ mainScreen: 'profile' }); assert.ok(profile.find('GuestAccountScreen'));
  const auth = renderApp({ showAuth: true });
  function labels(node) { return !node || typeof node !== 'object' ? [] : [node.props?.accessibilityLabel, ...(node.props?.children?.flat(Infinity) || []).flatMap(labels)].filter(Boolean); }
  assert.ok(labels(auth.c.tree).includes('Continue as Guest'));
});

test('the guest player receives only public lessons with its selected index remapped', () => {
  const course = { _id: 'course', videos: [{ _id: 'intro', publicPlayback: true }, { _id: 'paid', locked: true }, { _id: 'extra', publicPlayback: true }] };
  const f = renderApp({ mainScreen: 'courses', selectedCourse: course, startIndex: 2 });
  const player = f.find('ReelsScreen'); assert.ok(player);
  assert.equal(player.props.initialIndex, 1);
  assert.equal(player.props.preloadedVideos.length, 2);
  assert.equal(player.props.onVideoComplete, undefined); assert.equal(player.props.onVideoProgress, undefined);
});

test('the native player consumes a guest lease instead of waiting forever for a login session', () => {
  const player = ast.program.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === 'VideoItem');
  const lease = player.body.body.find(n => n.type === 'VariableDeclaration' && n.declarations.some(d => d.id.name === 'validCloudLease'));
  for (const user of [null, undefined, {}, { sessionId: null }, { sessionId: '' }, { sessionId: 'signed-in' }]) {
    const c = { courseId: 'course', videoProp: { _id: 'intro' }, user, cloudLease: { hlsUrl: '/authorized.m3u8' }, cloudLeaseRef: { current: {} } };
    vm.createContext(c); vm.runInContext(fn('getPlaybackLeaseKey'), c);
    c.cloudLeaseRef.current.key = c.getPlaybackLeaseKey(c.courseId, c.videoProp._id, user?.sessionId);
    assert.equal(vm.runInContext(`${slice(lease)}; validCloudLease`, c), c.cloudLease);
  }
});
test('the native player rejects a lease from a different course, lesson or account session', () => {
  const player = ast.program.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === 'VideoItem');
  const lease = player.body.body.find(n => n.type === 'VariableDeclaration' && n.declarations.some(d => d.id.name === 'validCloudLease'));
  for (const key of ['other:intro:', 'course:other:', 'course:intro:old-session']) {
    const c = { courseId: 'course', videoProp: { _id: 'intro' }, user: null, cloudLease: { hlsUrl: '/wrong.m3u8' }, cloudLeaseRef: { current: { key } } };
    vm.createContext(c); vm.runInContext(fn('getPlaybackLeaseKey'), c);
    assert.equal(vm.runInContext(`${slice(lease)}; validCloudLease`, c), null);
  }
});

test('guests cannot play an automatically exposed introduction from an older backend', async () => {
  const c = { hasCourseAccess: () => false, fetchApiJson: async () => ({ videos: [{ _id: 'paid-intro', title: 'Introduction', locked: false, isFree: true, publicPlayback: true, hlsUrl: 'https://paid.example/video', notes: 'Paid notes' }] }) };
  vm.createContext(c); vm.runInContext(fn('requestCourseVideos'), c);
  const result = await c.requestCourseVideos({}, null, 'course');
  assert.equal(result.videos[0].locked, true); assert.equal(result.videos[0].isFree, false);
  assert.equal(result.videos[0].hlsUrl, undefined); assert.equal(result.videos[0].publicPlayback, undefined);
  assert.equal(result.videos[0].notes, undefined);
});
test('only the explicit-free backend policy may enable free guest lessons', async () => {
  const payload = { publicAccessPolicy: 'explicit-free-v1', videos: [{ _id: 'paid', locked: true }, { _id: 'preview', locked: false, isFree: true, publicPlayback: true }] };
  const c = { hasCourseAccess: () => false, fetchApiJson: async () => payload };
  vm.createContext(c); vm.runInContext(fn('requestCourseVideos'), c);
  assert.equal(await c.requestCourseVideos({}, null, 'course'), payload);
});
