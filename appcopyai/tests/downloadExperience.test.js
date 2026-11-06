const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');
const { downloadPresentation } = require('../services/downloadPresentation');
const { createAccountDownloadScope } = require('../services/accountDownloads');
const source = fs.readFileSync(require.resolve('../App.js'), 'utf8');
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
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(grant = async () => ({ downloadUrl: '/video.mp4' })) {
  const transfers = [], alerts = [], states = [], files = new Map(), directories = new Set(), records = new Map();
  const storage = { getItem: async key => records.get(key), setItem: async (key, value) => records.set(key, value) };
  const fileSystem = {
    cacheDirectory: 'file:///cache/', makeDirectoryAsync: async path => { directories.add(path); },
    getInfoAsync: async path => ({ exists: files.has(path), size: files.get(path) || 0 }),
    deleteAsync: async path => {
      for (const entry of files.keys()) if (entry.startsWith(path)) files.delete(entry);
      for (const entry of directories) if (entry.startsWith(path)) directories.delete(entry);
    },
    createDownloadResumable: (_url, path, _options, progress) => {
      const pending = deferred(); let cancelled = false;
      transfers.push({ path, progress, cancelled: () => cancelled,
        complete: () => { files.set(path, 2 * 1024 * 1024); pending.resolve({ status: 200 }); } });
      return { downloadAsync: () => pending.promise, cancelAsync: async () => {
        cancelled = true; pending.reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
      } };
    },
  };
  const c = { userRef: { current: { _id: 'learner', sessionId: 'session' } }, downloads: {}, downloadsRef: { current: {} },
    downloadJobsRef: { current: new Map() }, downloadStorageReady: { current: Promise.resolve() },
    hasCourseAccess: () => true, useCallback: fn => fn, getBunnyGuid: () => '', getBunnyLibraryId: () => '', getNativeVideoUrl: video => video.videoUrl || '',
    getHomeLessonThumbnailUrl: () => '', nativeSession: { requestJson: grant },
    requestPreparedCloudfrontDownload: require('../services/cloudfrontDownload').requestPreparedCloudfrontDownload,
    Platform: { OS: 'android' }, API_BASE: 'https://api.test', DEV_UI_QA_ENABLED: false, UI_QA_DOWNLOADS: {},
    Alert: { alert: (...args) => alerts.push(args) }, console: { warn() {} },
    setDownloadsRefreshing: () => {},
    selectHlsMediaPlaylist: async url => ({ url, text: '#EXTM3U\none.ts\ntwo.ts\nthree.ts' }),
    absoluteVideoTrackUrl: (part, base) => new URL(part, base).href,
    extensionForDownloadResource: () => 'ts',
  };
  c.setDownloads = update => { c.downloads = typeof update === 'function' ? update(c.downloads) : update; states.push(c.downloads); };
  const account = createAccountDownloadScope({ user: c.userRef.current, fs: fileSystem, storage });
  c.downloadScopeRef = { current: account };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(require.resolve('../downloadStorage.js'), 'utf8').replaceAll('export ', ''), c);
  for (const name of ['getDownloadId', 'getDownloadKind', 'getProtectedCourseDownloadKind', 'formatDownloadSize', 'downloadHlsToAppCache']) {
    vm.runInContext(slice(ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === name)), c);
  }
  for (const name of ['startDownload', 'deleteDownload', 'refreshDownloads']) {
    const node = find(ast, node => node.type === 'VariableDeclarator' && node.id?.name === name);
    vm.runInContext(`this.${name} = ${slice(node.init)}`, c);
  }
  return { c, account, transfers, alerts, files, directories, records, states,
    start: id => c.startDownload({ id, videoUrl: `https://video.test/${id}.mp4`, title: id }, 'course', 'Course') };
}

test('preparation, unknown total, transfer bytes and final verification have honest labels', () => {
  const size = bytes => bytes ? `${bytes} B` : '';
  assert.equal(downloadPresentation({ status: 'downloading', phase: 'preparing' }).label, 'Preparing video…');
  const unknown = downloadPresentation({ status: 'downloading', progressKnown: false, bytesWritten: 1000 }, size);
  assert.equal(unknown.label, 'Downloading…'); assert.equal(unknown.percent, null); assert.match(unknown.detail, /Total size unknown/);
  const transfer = downloadPresentation({ status: 'downloading', progress: 0.25, bytesWritten: 25, totalBytes: 100 }, size);
  assert.equal(transfer.label, 'Downloading 25%'); assert.equal(transfer.detail, '25 B of 100 B');
  assert.equal(downloadPresentation({ status: 'downloading', phase: 'finalizing' }).label, 'Finishing download…');
  assert.equal(downloadPresentation({ status: 'downloading', phase: 'cancelling' }).canCancel, false);
});

test('Cancel while preparing aborts the authorization request and removes the partial folder', async () => {
  const grant = deferred(); let signal;
  const f = fixture((_url, options) => { signal = options.signal; return grant.promise; });
  const pending = f.c.startDownload({ id: 'protected', provider: 'aws_cloudfront', title: 'Protected' }, 'course', 'Course');
  await settle(); assert.equal(f.c.downloads.cloud_protected.phase, 'preparing');
  await f.c.deleteDownload('cloud_protected'); await pending;
  assert.equal(signal.aborted, true); assert.equal(f.transfers.length, 0);
  assert.equal(f.c.downloads.cloud_protected, undefined); assert.equal(f.directories.size, 0);
  grant.resolve({ downloadUrl: '/late.mp4' }); await settle(); assert.equal(f.transfers.length, 0); assert.deepEqual(f.alerts, []);
});

test('Cancel stops only the selected transfer, removes its partial files and permits downloading it again', async () => {
  const f = fixture(); const first = f.start('one'), second = f.start('two'); await settle();
  f.transfers[0].progress({ totalBytesWritten: 100, totalBytesExpectedToWrite: 200 });
  assert.equal(f.c.downloads.media_one.bytesWritten, 100); assert.equal(f.c.downloads.media_one.progress, 0.5);
  await f.c.deleteDownload('media_one'); await first;
  assert.equal(f.transfers[0].cancelled(), true); assert.equal(f.transfers[1].cancelled(), false);
  assert.equal(f.c.downloads.media_one, undefined); assert.equal(f.c.downloads.media_two.status, 'downloading');
  f.transfers[0].progress({ totalBytesWritten: 200, totalBytesExpectedToWrite: 200 });
  assert.equal(f.c.downloads.media_one, undefined);
  const retry = f.start('one'); await settle(); f.transfers[2].complete(); f.transfers[1].complete(); await Promise.all([retry, second]);
  assert.equal(f.c.downloads.media_one.status, 'done'); assert.equal(f.c.downloads.media_two.status, 'done'); assert.deepEqual(f.alerts, []);
});

test('rapid download taps share one task and tapping an already saved lesson keeps its video file', async () => {
  const f = fixture(); const first = f.start('one'); await f.start('one'); await settle(); assert.equal(f.transfers.length, 1);
  f.transfers[0].complete(); await first; const path = f.c.downloads.media_one.path;
  await f.start('one'); assert.equal(f.transfers.length, 1); assert.equal(f.files.has(path), true);
  assert.ok(f.states.some(state => state.media_one?.phase === 'finalizing'));
});

test('pull-to-refresh keeps a live download visible and cancellable', async () => {
  const f = fixture(); const pending = f.start('one'); await settle(); await f.c.refreshDownloads();
  assert.equal(f.c.downloads.media_one.status, 'downloading');
  await f.c.deleteDownload('media_one'); await pending; assert.equal(f.c.downloads.media_one, undefined);
});

test('cancelling a segmented HLS download stops the current segment and removes its partial bundle', async () => {
  const f = fixture();
  const pending = f.c.startDownload({ id: 'segmented', videoUrl: 'https://video.test/index.m3u8', title: 'Segmented' }, 'course', 'Course');
  await settle(); assert.equal(f.transfers.length, 1);
  f.transfers[0].complete(); await settle(); assert.equal(f.transfers.length, 2);
  assert.equal(f.c.downloads.cloud_segmented.phase, 'transferring');
  await f.c.deleteDownload('cloud_segmented'); await pending;
  assert.equal(f.transfers[1].cancelled(), true); assert.equal(f.transfers.length, 2);
  assert.equal(f.directories.size, 0); assert.equal(f.files.size, 0); assert.deepEqual(f.alerts, []);
});

test('cancellation during server preparation polling prevents any further poll or transfer', async () => {
  const { requestPreparedCloudfrontDownload } = require('../services/cloudfrontDownload');
  let requests = 0; const scope = createAccountDownloadScope({ user: { _id: 'a', sessionId: 's' }, fs: {}, storage: {} }).fork();
  const session = scope.session({ requestJson: async () => ++requests === 1 ? { downloadUrl: '/video', statusUrl: '/status' } : { status: 'pending' } });
  await assert.rejects(requestPreparedCloudfrontDownload({ session, courseId: 'c', videoId: 'v', waitFn: () => scope.cancel() }), { name: 'AbortError' });
  assert.equal(requests, 2);
});
