const test = require('node:test');
const assert = require('node:assert/strict');
const { createAccountDownloadScope } = require('../services/accountDownloads');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture() {
  const records = new Map();
  const storage = { getItem: async key => records.get(key), setItem: async (key, value) => records.set(key, value) };
  const fs = { cacheDirectory: 'file:///cache/', documentDirectory: 'file:///documents/', getInfoAsync: async () => ({ exists: true }) };
  const scope = (id, extra = {}) => createAccountDownloadScope({ user: { _id: id, sessionId: 'session' }, fs, storage, ...extra });
  return { fs, storage, records, scope };
}

test('accounts have separate metadata and video directories, including similar IDs', async () => {
  const f = fixture(); const a = f.scope('a/b'); const b = f.scope('a_b');
  assert.notEqual(a.fs.cacheDirectory, b.fs.cacheDirectory);
  assert.equal(a.fs.documentDirectory, null);
  await a.storage.setItem('downloads', '{"lesson":"a"}');
  assert.equal(await b.storage.getItem('downloads'), undefined);
  assert.equal(await f.scope('a/b').storage.getItem('downloads'), '{"lesson":"a"}');
});

test('ownerless legacy records are never imported into an account', async () => {
  const f = fixture(); f.records.set('downloads', '{"privateLesson":{}}');
  assert.equal(await f.scope('new-user').storage.getItem('downloads'), undefined);
});

test('download recovery restores only the signed-in owner and rejects another account path', async () => {
  const vm = require('node:vm');
  const source = require('node:fs').readFileSync(require.resolve('../downloadStorage.js'), 'utf8');
  const module = vm.runInNewContext(`${source.replaceAll('export ', '')}\n({ prepareTemporaryDownloads, downloadPath, DOWNLOADS_STORAGE_KEY })`);
  const f = fixture(); f.fs.makeDirectoryAsync = async () => {};
  const a = f.scope('a'); const b = f.scope('b');
  const path = module.downloadPath(a.fs, 'lesson');
  await a.storage.setItem(module.DOWNLOADS_STORAGE_KEY, JSON.stringify({ lesson: { status: 'done', kind: 'mp4', path } }));
  assert.equal((await module.prepareTemporaryDownloads(a.fs, a.storage)).lesson.path, path);
  assert.equal(Object.keys(await module.prepareTemporaryDownloads(b.fs, b.storage)).length, 0);
  // Even misplaced metadata must not expose the other account's video bytes.
  await b.storage.setItem(module.DOWNLOADS_STORAGE_KEY, JSON.stringify({ lesson: { status: 'done', kind: 'mp4', path } }));
  assert.equal(Object.keys(await module.prepareTemporaryDownloads(b.fs, b.storage)).length, 0);
  assert.equal((await module.prepareTemporaryDownloads(f.scope('a').fs, a.storage)).lesson.path, path);
});

test('logout cancels the native transfer and ignores late progress and completion', async () => {
  const f = fixture(); const completed = deferred(); let progress; let cancelled = 0; let updates = 0;
  f.fs.createDownloadResumable = (_url, _path, _options, callback) => {
    progress = callback;
    return { downloadAsync: () => completed.promise, cancelAsync: async () => { cancelled++; } };
  };
  const scope = f.scope('a');
  const task = scope.fs.createDownloadResumable('https://video', 'path', {}, () => updates++);
  const result = task.downloadAsync();
  progress({}); assert.equal(updates, 1);
  await scope.cancel();
  assert.equal(cancelled, 1); assert.equal(scope.signal.aborted, true);
  progress({}); assert.equal(updates, 1);
  completed.resolve({ status: 200 });
  await assert.rejects(result, { name: 'AbortError' });
  await assert.rejects(scope.storage.setItem('downloads', 'late result'), { name: 'AbortError' });
  assert.equal(f.records.size, 0);
});

test('an account change blocks late filesystem and authorization responses', async () => {
  const f = fixture(); const pending = deferred(); let current = true;
  f.fs.getInfoAsync = () => pending.promise;
  const scope = f.scope('a', { isCurrent: () => current });
  const stat = scope.fs.getInfoAsync('path');
  const request = scope.session({ requestJson: () => pending.promise }).requestJson('/grant');
  current = false; pending.resolve({ downloadUrl: '/private' });
  await assert.rejects(stat, { name: 'AbortError' });
  await assert.rejects(request, { name: 'AbortError' });
  assert.equal(scope.active(), false);
});

test('logout during preparation prevents further polling or a transfer', async () => {
  const { requestPreparedCloudfrontDownload } = require('../services/cloudfrontDownload');
  const f = fixture(); const scope = f.scope('a'); let requests = 0;
  const session = scope.session({ requestJson: async () => {
    requests++;
    return requests === 1 ? { downloadUrl: '/video', statusUrl: '/status' } : { status: 'pending' };
  } });
  await assert.rejects(requestPreparedCloudfrontDownload({ session, courseId: 'course', videoId: 'lesson',
    waitFn: async () => { await scope.cancel(); },
  }), { name: 'AbortError' });
  assert.equal(requests, 2);
});

test('signed-out sessions cannot create a download scope', () => {
  const f = fixture();
  assert.equal(createAccountDownloadScope({ fs: f.fs, storage: f.storage }), null);
  assert.equal(createAccountDownloadScope({ user: { _id: 'a' }, fs: f.fs, storage: f.storage }), null);
});
