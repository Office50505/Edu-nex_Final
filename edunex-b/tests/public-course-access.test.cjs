const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const policy = require('../services/publicCourseAccess');
const { publicPlayableVideoInfo } = require('../services/mobileCompatibilityService');
const course = () => ({ _id: 'course', title: 'Course', status: 'published', videos: [
  { _id: 'paid', title: 'Paid', order: 2, provider: 'bunny_stream', videoUrl: 'https://private.example/paid', notesUrl: 'https://private.example/notes', bunnyVideoId: 'private-id' },
  { _id: 'intro', title: 'Introduction', order: 1, provider: 'aws_cloudfront', videoUrl: 'https://private.example/intro.m3u8' },
] });

test('all lessons in paid and legacy courses stay private, including the first lesson', () => {
  const c = course();
  assert.equal(policy.isPublicLesson(c, c.videos[1]), false);
  assert.equal(policy.isPublicLesson(c, c.videos[0]), false);
  c.publicPreviewEnabled = true;
  assert.equal(policy.isPublicLesson(c, c.videos[1]), false);
  assert.deepEqual(policy.orderedLessons(c).map(v => v._id), ['intro', 'paid']);
});
test('free courses and explicit free lessons remain public; draft and foreign lessons never do', () => {
  const c = course(); c.publicPreviewEnabled = false;
  assert.equal(policy.isPublicLesson(c, c.videos[1]), false);
  c.videos[0].isFree = true;
  assert.equal(policy.isPublicLesson(c, c.videos[0]), true);
  c.accessType = 'free';
  assert.ok(c.videos.every(video => policy.isPublicLesson(c, video)));
  assert.equal(policy.isPublicLesson(c, { _id: 'foreign', isFree: true }), false);
  c.status = 'draft';
  assert.ok(c.videos.every(video => !policy.isPublicLesson(c, video)));
});
test('public lesson lists disclose neither paid media nor paid notes and prompts', () => {
  const c = course(); c.videos[1].isFree = true;
  const payload = policy.publicCourseVideos(c, publicPlayableVideoInfo);
  assert.equal(payload[0].publicPlayback, true);
  assert.equal(payload[0].playbackRequired, true);
  assert.equal(payload[0].videoUrl, undefined);
  assert.equal(payload[1].locked, true);
  assert.equal(JSON.stringify(payload).includes('private.example'), false);
  assert.equal(JSON.stringify(payload).includes('private-id'), false);
});

function fixture() {
  const routes = []; let current = course(); current.videos[1].isFree = true; let grants = 0; let mediaFetches = 0;
  let grant = { publicLesson: true, courseId: 'course', videoId: 'intro', reference: current.videos[1].videoUrl };
  const auth = () => {};
  const c = { module: { exports: {} }, process, URL, require(name) {
    if (name.startsWith('node:')) return require(name);
    if (name === 'express') return { Router: () => ({ get: (...r) => routes.push(r), post: (...r) => routes.push(r) }) };
    if (name.endsWith('compatAuth')) return { requireCompatibleAuth: () => auth };
    if (name.endsWith('adminAuth')) return { protectAdmin: auth, protectAdminRead: auth };
    if (name.endsWith('certificationService')) return { access: async () => assert.fail('Public requests must not access an account') };
    if (name.endsWith('/Course')) return { findOne: query => { assert.equal(query.status, 'published'); return { select: () => ({ lean: async () => current }) }; } };
    if (name.endsWith('/User')) return { findById: () => assert.fail('Public playback must not read user data') };
    if (name.endsWith('videoSources')) return { inferProvider: v => v.provider };
    if (name.endsWith('cloudFrontPlayback')) return { issueGrant: (_url, identity) => { grants++; return identity; }, decodeGrant: () => grant, fetchPlaylist: async () => { mediaFetches++; return '#EXTM3U'; } };
    if (name.endsWith('publicCourseAccess')) return policy;
    if (name.endsWith('mobileCompatibilityService')) return { publicPlayableVideoInfo };
    if (name.endsWith('ffmpegBinary')) return () => '';
    throw Error(name);
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../routes/playback'), 'utf8'), c);
  async function call(path, params = {}) {
    const r = routes.find(r => r[0] === path);
    const res = { code: 200, set() { return this; }, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; }, type() { return this; }, send(data) { this.data = data; return this; } };
    await r.at(-1)({ params, query: { grant: 'signed-test-grant' } }, res);
    return res;
  }
  return { call, routes, auth, setCourse: value => { current = value; }, setGrant: value => { grant = value; }, counts: () => ({ grants, mediaFetches }) };
}
const endpoint = '/public/courses/:courseId/videos/:videoId/playback-access';
test('anonymous public playback issues a scoped grant; private playback still requires auth', async () => {
  const f = fixture();
  const res = await f.call(endpoint, { courseId: 'course', videoId: 'intro' });
  assert.equal(res.code, 200); assert.equal(res.data.publicLesson, true);
  assert.equal(res.data.courseId, 'course'); assert.equal(res.data.videoId, 'intro');
  assert.equal(res.data.userId, undefined); assert.equal(res.data.preview, undefined);
  assert.equal(f.routes.find(r => r[0] === '/courses/:courseId/videos/:videoId/playback-access')[1], f.auth);
  assert.equal(f.routes.find(r => r[0] === '/courses/:courseId/videos/:videoId/download-grant')[1], f.auth);
});
test('anonymous requests cannot grant paid, foreign, missing or unpublished lessons', async () => {
  const f = fixture();
  assert.equal((await f.call(endpoint, { courseId: 'course', videoId: 'paid' })).code, 403);
  assert.equal((await f.call(endpoint, { courseId: 'course', videoId: 'foreign' })).code, 404);
  f.setCourse(null);
  assert.equal((await f.call(endpoint, { courseId: 'course', videoId: 'intro' })).code, 404);
  assert.equal(f.counts().grants, 0);
});
test('public HLS rechecks publication, preview policy, lesson ownership and source before fetching', async () => {
  const f = fixture();
  assert.equal((await f.call('/playback/hls.m3u8')).code, 200);
  const c = course(); f.setCourse(c);
  assert.equal((await f.call('/playback/hls.m3u8')).code, 403);
  c.videos[1].isFree = true; c.videos[1].videoUrl = 'https://changed.example/intro';
  assert.equal((await f.call('/playback/hls.m3u8')).code, 403);
  f.setCourse(null);
  assert.equal((await f.call('/playback/hls.m3u8')).code, 403);
  assert.equal(f.counts().mediaFetches, 1);
});

test('the public catalogue route has no authentication middleware and strips paid lesson sources', async () => {
  const source = fs.readFileSync(require.resolve('../routes/mobileCompat'), 'utf8');
  const start = source.indexOf("router.get('/public/courses/:id/videos'");
  const end = source.indexOf('\nrouter.get(', start + 1);
  let handler; let current = course(); current.videos[1].isFree = true;
  vm.runInNewContext(source.slice(start, end), {
    router: { get(path, ...handlers) { assert.equal(path, '/public/courses/:id/videos'); assert.equal(handlers.length, 1); handler = handlers[0]; } },
    asyncHandler: fn => fn,
    getCourse: async (_id, projection) => { assert.equal(projection, policy.publicCourseProjection); return current; },
    publicPlayableVideoInfo, require: () => policy,
  });
  const res = { code: 200, set() {}, json(data) { this.data = data; }, status(code) { this.code = code; return this; } };
  await handler({ params: { id: 'course' } }, res);
  assert.equal(res.data.publicAccessPolicy, 'explicit-free-v1');
  assert.equal(res.data.videos[0].locked, false); assert.equal(res.data.videos[1].locked, true);
  current.status = 'draft'; await handler({ params: { id: 'course' } }, res); assert.equal(res.code, 404);
});
test('public course database projections avoid embedded artwork', () => {
  for (const field of policy.publicCourseProjection.split(' ')) {
    assert.notEqual(field, 'videos'); assert.ok(!field.endsWith('.data'));
  }
  assert.ok(policy.publicCourseProjection.includes('videos.isFree'));
});

test('every paid lesson including the introduction rejects anonymous playback grants', async () => {
  const f = fixture(); f.setCourse(course());
  for (const videoId of ['intro', 'paid']) {
    assert.equal((await f.call(endpoint, { courseId: 'course', videoId })).code, 403);
  }
  assert.equal(f.counts().grants, 0);
});
test('legacy preview flags and caller-provided free flags cannot expose paid content', () => {
  const c = course(); c.publicPreviewEnabled = true;
  assert.ok(policy.publicCourseVideos(c, publicPlayableVideoInfo).every(video => video.locked));
  assert.equal(policy.isPublicLesson(c, { ...c.videos[1], isFree: true }), false);
});
