const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');
const source = fs.readFileSync(require.resolve('../App.js'), 'utf8');
const ast = babel.parseSync(source, { babelrc: false, configFile: false, parserOpts: { plugins: ['jsx'] } });
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return null;
}
const slice = node => source.slice(node.start, node.end);
const declarations = ['getDownloadId', 'getDownloadKind', 'getProtectedCourseDownloadKind', 'LessonDownloadButton']
  .map(name => slice(ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === name))).join('\n');
const compiled = babel.transformSync(declarations, { configFile: false, babelrc: false,
  plugins: [require.resolve('@babel/plugin-transform-react-jsx')] }).code;

function fixture() {
  const context = {
    safeDownloadId: value => String(value).replace(/[^a-zA-Z0-9_-]/g, '_'),
    downloadPresentation: require('../services/downloadPresentation').downloadPresentation,
    downloadJobsRef: { current: new Map() },
    getBunnyGuid: video => video?.bunnyGuid || '',
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', Ionicons: 'Icon', Text: 'Text', C: {}, s: {},
  };
  vm.createContext(context);
  vm.runInContext(compiled, context);
  return context;
}

test('protected lesson metadata receives the same ID in the list, player and downloader', () => {
  const c = fixture();
  for (const video of [{ _id: 'lesson-1' }, { id: 'lesson-1' }, { videoId: 'lesson-1' }]) {
    assert.equal(c.getProtectedCourseDownloadKind(video, 'course'), 'hls');
    assert.equal(c.getDownloadId(video, 0, 'course'), 'cloud_lesson-1');
  }
  assert.equal(c.getDownloadId({ _id: 'lesson-1' }, 0), '');
  assert.equal(c.getDownloadId({ provider: 'aws_cloudfront', _id: 'lesson-1' }, 0, 'course'), 'cloud_lesson-1');
  assert.equal(c.getDownloadId({ bunnyGuid: 'bunny-1' }, 0, 'course'), 'bunny-1');
});

test('visible download action starts the requested lesson and stops the play-row press', () => {
  const c = fixture();
  const video = { _id: 'lesson-1', title: 'Introduction' };
  const calls = []; let stopped = false;
  const button = c.LessonDownloadButton({ video, index: 0, courseId: 'course', courseTitle: 'Creator Basics', onDownload: (...args) => calls.push(args) });
  assert.equal(button.props.disabled, false);
  assert.equal(button.props.children[1].props.children[0], 'Download');
  button.props.onPress({ stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  assert.deepEqual(calls, [[video, 'course', 'Creator Basics', 0]]);
});

test('both download entry points expose progress, saved state and retry without duplicate requests', () => {
  const c = fixture();
  for (const variant of ['row', 'rail']) for (const [download, label, disabled] of [
    [{ status: 'downloading', progress: 0.42 }, '42%', true],
    [{ status: 'done' }, 'Saved', true],
    [{ status: 'error' }, 'Retry', false],
  ]) {
    let calls = 0;
    const button = c.LessonDownloadButton({ video: { _id: 'lesson' }, index: 0, courseId: 'course', variant, download, onDownload: () => calls++ });
    assert.equal(button.props.children[1].props.children[0], label);
    assert.equal(button.props.disabled, disabled);
    button.props.onPress();
    assert.equal(calls, disabled ? 0 : 1);
  }
});

test('unsupported lessons do not offer a download that can never start', () => {
  const c = fixture();
  const button = c.LessonDownloadButton({ video: { title: 'Unavailable lesson' }, index: 0, onDownload() { assert.fail('Must not start'); } });
  assert.equal(button.props.disabled, true);
  assert.equal(button.props.children[1].props.children[0], 'Unavailable');
  button.props.onPress();
});

test('a protected metadata-only lesson completes the authorized download and appears in saved downloads', async () => {
  const c = fixture();
  let downloads = {}, stored, grantRequest;
  Object.assign(c, {
    hasCourseAccess: () => true, useCallback: fn => fn, userRef: { current: { _id: 'learner', sessionId: 'session' } },
    downloadsRef: { current: {} }, downloadStorageReady: { current: Promise.resolve() },
    getBunnyLibraryId: () => '', getNativeVideoUrl: () => '', getHomeLessonThumbnailUrl: () => '',
    downloadDir: (_fs, id) => `cache/${id}/`, downloadPath: (_fs, id) => `cache/${id}/video.mp4`,
    downloadManifestPath: (_fs, id) => `cache/${id}/index.m3u8`,
    setDownloads: update => { downloads = update(downloads); },
    AsyncStorage: { setItem: async (_key, data) => { stored = JSON.parse(data); } },
    DOWNLOADS_STORAGE_KEY: 'downloads', API_BASE: 'https://api.example.test', Platform: { OS: 'android' },
    nativeSession: {},
    requestPreparedCloudfrontDownload: async args => { grantRequest = args; return { downloadUrl: '/authorized.mp4' }; },
    FileSystem: {
      makeDirectoryAsync: async () => {}, deleteAsync: async () => {},
      getInfoAsync: async () => ({ exists: true, size: 2 * 1024 * 1024 }),
      createDownloadResumable: (url, path, _options, progress) => {
        assert.equal(url, 'https://api.example.test/authorized.mp4');
        assert.equal(path, 'cache/cloud_lesson-1/video.mp4');
        return { downloadAsync: async () => { progress({ totalBytesWritten: 200, totalBytesExpectedToWrite: 200 }); return { status: 200 }; } };
      },
    },
    Alert: { alert: (...args) => assert.fail(`Unexpected download error: ${args.join(' ')}`) },
    getDownloadFailureMessage: error => error.message, console,
  });
  c.downloadScopeRef = { current: require('../services/accountDownloads').createAccountDownloadScope({
    user: c.userRef.current, fs: c.FileSystem, storage: c.AsyncStorage,
  }) };
  const declaration = find(ast, node => node.type === 'VariableDeclarator' && node.id?.name === 'startDownload');
  vm.runInContext(`this.startDownload = ${slice(declaration.init)};`, c);
  await c.startDownload({ id: 'lesson-1', title: 'Introduction' }, 'course', 'Creator Basics', 0);
  assert.equal(grantRequest.courseId, 'course');
  assert.equal(grantRequest.videoId, 'lesson-1');
  assert.equal(downloads.cloud_lesson_1, undefined);
  assert.equal(downloads['cloud_lesson-1'].status, 'done');
  assert.equal(stored['cloud_lesson-1'].videoId, 'lesson-1');
  assert.equal(stored['cloud_lesson-1'].path, 'cache/cloud_lesson-1/video.mp4');
});

test('empty Downloads gives users a direct route to courses', () => {
  const button = find(ast, node => node.type === 'JSXOpeningElement' && node.attributes.some(attr => attr.name?.name === 'accessibilityLabel'
    && attr.value?.value === 'Browse courses to download lessons'));
  assert.ok(button);
  let target;
  const press = button.attributes.find(attr => attr.name?.name === 'onPress').value.expression;
  vm.runInNewContext(`(${slice(press)})()`, { navigateRootTab: value => { target = value; } });
  assert.equal(target, 'courses');
});

test('actual downloader cannot publish a late completion after logout', async () => {
  const c = fixture(); let complete; let started; let cancelled = 0; let progress;
  const startedPromise = new Promise(resolve => { started = resolve; });
  const completion = new Promise(resolve => { complete = resolve; });
  let downloads = {}; const writes = [];
  Object.assign(c, {
    hasCourseAccess: () => true, useCallback: fn => fn, userRef: { current: { _id: 'a', sessionId: 'session' } },
    downloadsRef: { current: {} }, downloadStorageReady: { current: Promise.resolve() },
    getBunnyLibraryId: () => '', getNativeVideoUrl: video => video.videoUrl, getHomeLessonThumbnailUrl: () => '',
    downloadDir: (fs, id) => `${fs.cacheDirectory}${id}/`,
    downloadPath: (fs, id) => `${fs.cacheDirectory}${id}/video.mp4`,
    setDownloads: update => { downloads = typeof update === 'function' ? update(downloads) : update; },
    DOWNLOADS_STORAGE_KEY: 'downloads', API_BASE: 'https://api.test', nativeSession: {},
    Alert: { alert: () => assert.fail('Cancellation must not display a download error') }, console,
  });
  const scope = require('../services/accountDownloads').createAccountDownloadScope({
    user: c.userRef.current, storage: { setItem: async (...args) => writes.push(args) },
    fs: { cacheDirectory: 'file:///cache/', makeDirectoryAsync: async () => {}, deleteAsync: async () => {},
      getInfoAsync: async () => ({ exists: true, size: 2000 }),
      createDownloadResumable: (_url, path, _options, callback) => {
        assert.match(path, /skillomate_accounts\/a\//); progress = callback;
        return { downloadAsync: () => { started(); return completion; }, cancelAsync: async () => { cancelled++; } };
      },
    },
  });
  c.downloadScopeRef = { current: scope };
  const declaration = find(ast, node => node.type === 'VariableDeclarator' && node.id?.name === 'startDownload');
  vm.runInContext(`this.startDownload = ${slice(declaration.init)};`, c);
  const result = c.startDownload({ id: 'lesson', videoUrl: 'https://video.test/lesson.mp4' }, 'course', 'Course');
  await startedPromise;
  await scope.cancel(); downloads = {};
  progress({ totalBytesWritten: 2000, totalBytesExpectedToWrite: 2000 }); complete({ status: 200 });
  await result;
  assert.equal(cancelled, 1);
  assert.deepEqual(downloads, {});
  assert.deepEqual(writes, []);
});

test('logout clears downloads and cancels transfers before clearing the user', async () => {
  const logout = find(ast, node => node.type === 'FunctionDeclaration' && node.id?.name === 'handleLogout');
  const calls = [];
  const context = { downloadScopeRef: { current: { cancel: async () => calls.push('cancel') } }, downloadsRef: { current: { lesson: {} } },
    AsyncStorage: { removeItem: async () => {} }, AI_AVATAR_STORAGE_KEY: 'avatar',
    nativeSession: { flush: async () => {} },
    setUser: () => calls.push('clear-user'), setDownloads: () => calls.push('clear-downloads'),
  };
  for (const name of ['setShowAuth', 'setAiRobotId', 'setWishlist', 'setCourseProgress', 'clearLoginForm', 'resetSignup',
    'setLegalPage', 'setSelectedCourse', 'setStartIndex', 'setCourseAiTarget', 'setMainScreen']) context[name] = () => {};
  await vm.runInNewContext(`(${slice(logout)})()`, context);
  assert.deepEqual(calls, ['cancel', 'clear-downloads', 'clear-user']);
  assert.equal(Object.keys(context.downloadsRef.current).length, 0);
});
