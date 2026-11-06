const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');
const source = fs.readFileSync(require.resolve('../App.js'), 'utf8');
const ast = babel.parseSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } });
const app = ast.program.body.find(node => node.type === 'ExportDefaultDeclaration').declaration;
const slice = node => source.slice(node.start, node.end);
const declaration = name => app.body.body.find(node => node.type === 'VariableDeclaration'
  && node.declarations.some(item => item.id?.name === name));
const course = { _id: 'course', title: 'Viral Hook', videos: [{ _id: 'lesson', order: 0 }] };
const wishlist = { key: 'main:wishlist', mainScreen: 'wishlist', selectedCourse: null, startIndex: null };
const profile = { key: 'main:profile', mainScreen: 'profile' };
const overview = { key: 'course:course', mainScreen: 'courses', selectedCourse: course, startIndex: null };

function fixture({ origin = wishlist, history = [profile, wishlist], startIndex = null, requestJson } = {}) {
  const c = {
    showProblemReport: false, certModal: null, showAppUpgrade: false, courseAiTarget: null, legalPage: null,
    mainScreen: 'courses', selectedCourse: course, startIndex, initialTime: 0, preloadedVideos: null, isPreviewOnly: false,
    showAuth: false, resetVisible: false, screen: 'login', otpSent: false,
    userRef: { current: { _id: 'learner', sessionId: 'session' } },
    routeHistoryRef: { current: [...history] }, courseReturnRouteRef: { current: origin },
    currentRouteRef: { current: wishlist }, restoringRouteRef: { current: false },
    courseOpenRequestRef: { current: 1 }, courseOpenRetryRef: { current: null },
    loadCourseProgress() {}, resetToHomeFromBack() {}, backToLessons() {}, closePasswordReset() {}, resetSignup() {}, invalidateOtpRequest() {},
    useCallback: fn => fn, hasCourseAccess: () => true, ROOT_TAB_ORDER: ['home', 'courses', 'ai', 'downloads'],
    DEV_UI_QA_ENABLED: false, sortLessons: videos => [...videos], getVideoKey: video => video._id,
    requestCourseVideos: (session, user, id) => session.requestJson(`/api/courses/${id}/videos`),
    nativeSession: { requestJson: requestJson || (async () => ({ videos: course.videos })) },
  };
  const fields = ['showAuth', 'showProblemReport', 'showAppUpgrade', 'certModal', 'legalPage', 'courseAiTarget', 'selectedCourse',
    'startIndex', 'initialTime', 'preloadedVideos', 'isPreviewOnly', 'mainScreen', 'courseOpenStatus', 'canGoBack', 'aiActiveCourseHint'];
  for (const field of fields) c[`set${field[0].toUpperCase()}${field.slice(1)}`] = value => { c[field] = value; };
  vm.createContext(c);
  vm.runInContext(['restoreRoute', 'handleAppBack', 'openCourse', 'navigateRootTab'].map(name => slice(declaration(name))).join('\n')
    + '\nthis.actions = { back: handleAppBack, open: openCourse, navigate: navigateRootTab };', c);
  return c;
}

test('Back from a saved course restores Wishlist and retains the earlier Profile entry', () => {
  const c = fixture();
  assert.equal(c.actions.back(), true);
  assert.equal(c.mainScreen, 'wishlist');
  assert.equal(c.selectedCourse, null);
  assert.equal(c.startIndex, null);
  assert.equal(c.courseReturnRouteRef.current, null);
  assert.deepEqual(c.routeHistoryRef.current.map(route => route.key), ['main:profile']);
  c.actions.back();
  assert.equal(c.mainScreen, 'profile');
});

test('Wishlist remains the destination even when navigation history has not been recorded yet', () => {
  const c = fixture({ history: [] });
  c.actions.back();
  assert.equal(c.mainScreen, 'wishlist');
});

test('Back from the player first returns to lessons, then to Wishlist', () => {
  const c = fixture({ startIndex: 0, history: [profile, wishlist, overview] });
  c.actions.back();
  assert.equal(c.mainScreen, 'courses');
  assert.equal(c.selectedCourse._id, course._id);
  assert.equal(c.startIndex, null);
  assert.equal(c.courseReturnRouteRef.current.mainScreen, 'wishlist');
  c.actions.back();
  assert.equal(c.mainScreen, 'wishlist');
});

test('leaving while a course loads prevents its late response from reopening it', async () => {
  let resolve;
  const c = fixture({ origin: null, requestJson: () => new Promise(done => { resolve = done; }) });
  c.mainScreen = 'wishlist'; c.selectedCourse = null;
  const opening = c.actions.open(course, { returnTo: 'wishlist' });
  assert.equal(c.courseReturnRouteRef.current.mainScreen, 'wishlist');
  c.actions.back();
  assert.equal(c.mainScreen, 'wishlist');
  resolve({ videos: course.videos });
  assert.equal(await opening, false);
  assert.equal(c.mainScreen, 'wishlist');
  assert.equal(c.selectedCourse, null);
});

test('explicit tab navigation clears the Wishlist destination and ignores late course data', async () => {
  let resolve;
  const c = fixture({ requestJson: () => new Promise(done => { resolve = done; }) });
  const opening = c.actions.open(course, { returnTo: 'wishlist' });
  c.actions.navigate('home');
  assert.equal(c.courseReturnRouteRef.current, null);
  resolve({ videos: course.videos });
  assert.equal(await opening, false);
  assert.equal(c.mainScreen, 'home');
});

test('Wishlist course selection explicitly supplies its return destination', () => {
  const render = declaration('renderWishlistScreen').declarations[0].init;
  const handler = render.body.openingElement.attributes.find(attr => attr.name?.name === 'onSelect').value.expression;
  let selected, options;
  vm.runInNewContext(`(${slice(handler)})(course)`, { course, openCourse: (value, opts) => { selected = value; options = opts; } });
  assert.equal(selected, course);
  assert.equal(options.returnTo, 'wishlist');
});
