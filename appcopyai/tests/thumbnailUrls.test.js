const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');

const source = fs.readFileSync(require.resolve('../App.js'), 'utf8');
const ast = babel.parseSync(source, { babelrc: false, configFile: false, parserOpts: { plugins: ['jsx'] } });
const names = ['getImageHost', 'getGoogleDriveFileId', 'normalizeThumbnailUrl', 'getThumbnailUrlCandidates',
  'getCourseThumbnailUri', 'getCourseThumbnailUris', 'getLessonThumbnailUrl', 'getHomeLessonThumbnailUrl'];
const c = {
  API_BASE: 'https://api.example',
  getBunnyGuid: lesson => lesson?.provider === 'bunny_stream' ? lesson.bunnyVideoId : '',
  getBunnyLibraryId: lesson => lesson.bunnyLibraryId || 'library',
};
vm.createContext(c);
vm.runInContext(names.map(name => {
  const fn = ast.program.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === name);
  return source.slice(fn.start, fn.end);
}).join('\n'), c);

test('video playlists, media files and encoded media paths never become image candidates', () => {
  for (const url of [
    'https://cdn.example/courses/lesson-6/LESSON%206%20/v1/LESSON%206%20.m3u8',
    'https://cdn.example/master.M3U8?signature=opaque#start',
    '/media/manifest.mpd', '/media/clip.mp4?download=1', '/media/clip.mov',
    '/media/clip.webm', '/media/clip.m4v', '/media/audio.mp3',
    '/media/playlist%2Em3u8?token=opaque',
  ]) {
    assert.equal(c.normalizeThumbnailUrl(url), '', url);
    assert.deepEqual(Array.from(c.getThumbnailUrlCandidates(url)), [], url);
  }
});

test('valid uploaded images, extensionless image endpoints and Drive thumbnails remain usable', () => {
  for (const url of ['https://cdn.example/photo.jpg', 'https://cdn.example/photo.webp?sig=opaque',
    'https://cdn.example/image?id=photo', 'https://cdn.example/photo.jpg?source=clip.mp4',
    'https://cdn.example/bad%escape.jpg']) {
    assert.equal(c.normalizeThumbnailUrl(url), url);
  }
  assert.equal(c.normalizeThumbnailUrl('/api/courses/course/thumbnail'), 'https://api.example/api/courses/course/thumbnail');
  assert.equal(c.normalizeThumbnailUrl('https://drive.google.com/file/d/artwork-id/view', 640),
    'https://drive.google.com/thumbnail?id=artwork-id&sz=w640');
});

test('an invalid landscape thumbnail does not hide a valid portrait thumbnail', () => {
  const lesson = { thumbnailUrl: 'https://cdn.example/master.m3u8', thumbnailVerticalUrl: '/uploads/portrait.jpg' };
  assert.equal(c.getHomeLessonThumbnailUrl(lesson, {}), 'https://api.example/uploads/portrait.jpg');
});

test('invalid lesson artwork falls back to valid course artwork before any image request', () => {
  const lesson = { provider: 'aws_cloudfront', thumbnailUrl: 'https://cdn.example/master.m3u8', thumbnailVerticalUrl: '/clip.mp4' };
  const course = { thumbnailUrl: '/uploads/course.jpg', thumbnailVerticalUrl: '/course/master.m3u8' };
  assert.equal(c.getHomeLessonThumbnailUrl(lesson, course), 'https://api.example/uploads/course.jpg');
  const candidates = Array.from(c.getCourseThumbnailUris(course, true));
  assert.deepEqual(candidates, ['https://api.example/uploads/course.jpg', '/uploads/course.jpg']);
  assert.ok(candidates.every(url => !url.includes('m3u8')));
});

test('provider thumbnails are retained when uploaded thumbnail fields contain video URLs', () => {
  assert.equal(c.getLessonThumbnailUrl({ provider: 'bunny_stream', bunnyVideoId: 'video-id',
    thumbnailUrl: '/clip.mp4' }, {}), 'https://api.example/api/bunny/thumbnail/video-id?libraryId=library');
  assert.equal(c.getLessonThumbnailUrl({ youtubeId: 'video-id', thumbnailUrl: '/master.m3u8' }, {}),
    'https://img.youtube.com/vi/video-id/mqdefault.jpg');
});

test('missing usable artwork leaves the existing visual placeholder without an invalid request', () => {
  assert.equal(c.getHomeLessonThumbnailUrl({ thumbnailUrl: '/master.m3u8' }, {}), '');
  assert.deepEqual(Array.from(c.getThumbnailUrlCandidates('')), []);
});

test('valid lesson uploads retain priority over provider and course fallbacks', () => {
  assert.equal(c.getHomeLessonThumbnailUrl({ provider: 'bunny_stream', bunnyVideoId: 'video-id',
    thumbnailUrl: '/uploads/lesson.jpg' }, { thumbnailUrl: '/uploads/course.jpg' }),
  'https://api.example/uploads/lesson.jpg');
});

function remoteImage(props) {
  let index = 0;
  const fn = ast.program.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === 'RemoteThumbnailImage');
  Object.assign(c, {
    React: { createElement: (type, props) => ({ type, props }) },
    Image: 'Image', StyleSheet: { absoluteFill: {} },
    useMemo: fn => fn(), useEffect() {},
    useState: () => [index, update => { index = typeof update === 'function' ? update(index) : update; }],
    traceImageFailure() {},
  });
  vm.runInContext(babel.transformSync(source.slice(fn.start, fn.end), {
    babelrc: false, configFile: false, plugins: [require.resolve('@babel/plugin-transform-react-jsx')],
  }).code, c);
  return () => c.RemoteThumbnailImage(props);
}

test('a failed image and failed proxy advance to course artwork and stop after exhausting candidates', () => {
  const render = remoteImage({ imageUrl: 'https://cdn.example/unavailable.jpg',
    fallbackImageUrl: 'https://api.example/course.jpg' });
  let image = render();
  assert.equal(image.props.source.uri, 'https://cdn.example/unavailable.jpg');
  image.props.onError(); image = render();
  assert.match(image.props.source.uri, /\/api\/image-proxy\?/);
  image.props.onError(); image = render();
  assert.equal(image.props.source.uri, 'https://api.example/course.jpg');
  image.props.onError();
  assert.equal(render(), null);
});

test('the actual image component skips a media URL and immediately uses fallback artwork', () => {
  const render = remoteImage({ imageUrl: 'https://cdn.example/master.m3u8',
    fallbackImageUrl: 'https://api.example/course.jpg' });
  assert.equal(render().props.source.uri, 'https://api.example/course.jpg');
});
