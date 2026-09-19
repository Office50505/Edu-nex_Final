const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const net = require('node:net');
const { decodeThumbnail, uploadThumbnail } = require('../services/thumbnailCdn');
const { saveThumbnailUpload } = require('../services/thumbnailStorage');

const env = {
  NODE_ENV: 'production',
  THUMBNAIL_S3_BUCKET: 'test-bucket',
  THUMBNAIL_S3_REGION: 'ap-south-1',
  THUMBNAIL_CDN_BASE_URL: 'https://images.example.test',
};
const pngBytes = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('test-image'),
]);
const image = { mimeType: 'image/png', data: pngBytes.toString('base64') };
const id = '6aa4ecd63ddad7649031c35f';

test('production upload writes validated bytes to S3 and returns a shared CDN URL', async () => {
  let sent;
  const client = { send: async (command) => { sent = command.input; } };
  const url = await uploadThumbnail(id, 'horizontal', image, { env, client });

  assert.equal(sent.Bucket, 'test-bucket');
  assert.deepEqual(sent.Body, pngBytes);
  assert.equal(sent.ContentType, 'image/png');
  assert.equal(sent.ACL, undefined);
  assert.match(sent.Key, /^course-thumbnails\/[a-f0-9]{24}\/horizontal-[a-f0-9]{64}\.png$/);
  assert.equal(url, `${env.THUMBNAIL_CDN_BASE_URL}/${sent.Key}`);
  assert.ok(!url.includes('/uploads/'));
});

test('S3 URL is shared and filesystem-independent when no CDN base is configured', async () => {
  let sent;
  const directEnv = { ...env };
  delete directEnv.THUMBNAIL_CDN_BASE_URL;
  const url = await uploadThumbnail(id, 'vertical', image, {
    env: directEnv,
    client: { send: async (command) => { sent = command.input; } },
  });

  assert.equal(url, `https://s3.ap-south-1.amazonaws.com/test-bucket/${sent.Key}`);
  assert.ok(!url.includes('localhost'));
  assert.ok(!url.includes('/uploads/'));
});

test('CDN configuration cannot resolve to local, IP, or EC2 instance storage', async () => {
  const client = { send: async () => { throw new Error('upload must not start'); } };
  for (const base of [
    'https://localhost:8443',
    'https://127.0.0.1',
    'https://1.2.3.4',
    'https://ec2-1-2-3-4.compute-1.amazonaws.com',
  ]) {
    await assert.rejects(
      uploadThumbnail(id, 'horizontal', image, { env: { ...env, THUMBNAIL_CDN_BASE_URL: base }, client }),
      (error) => error.statusCode === 503 && /permanent HTTPS URL/.test(error.message)
    );
  }
});

test('production S3 failure is controlled, logs no secrets, and never writes locally', async () => {
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillomate-prod-thumbnail-'));
  const secret = 'aws-private-secret';
  const logs = [];
  try {
    await assert.rejects(
      saveThumbnailUpload(id, 'horizontal', image, {
        env,
        uploadDir,
        logger: { warn: (message) => logs.push(String(message)) },
        uploadThumbnail: async () => { throw new Error(`Access denied ${secret}`); },
      }),
      (error) => error.statusCode === 503 && error.message === 'Storage temporarily unavailable.'
    );
    assert.deepEqual(fs.readdirSync(uploadDir), []);
    assert.ok(!logs.join(' ').includes(secret));
    assert.ok(!logs.join(' ').includes(env.THUMBNAIL_S3_BUCKET));
  } finally {
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }
});

test('development may use the explicit local fallback only after shared storage fails', async () => {
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillomate-dev-thumbnail-'));
  const logs = [];
  try {
    const url = await saveThumbnailUpload(id, 'horizontal', image, {
      env: { NODE_ENV: 'development' },
      uploadDir,
      logger: { warn: (message) => logs.push(String(message)) },
      uploadThumbnail: async () => { throw new Error('not configured'); },
    });
    assert.equal(url, `/uploads/course-thumbnails/${id}-horizontal.png`);
    assert.deepEqual(fs.readFileSync(path.join(uploadDir, `${id}-horizontal.png`)), pngBytes);
    assert.match(logs.join(' '), /development-only local storage/);
  } finally {
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }
});

test('file type, image signature, identity, and size validation remain strict', async () => {
  assert.throws(() => decodeThumbnail({ mimeType: 'image/png', data: Buffer.from('not-png').toString('base64') }), /does not match/);
  assert.throws(() => decodeThumbnail({ mimeType: 'image/svg+xml', data: image.data }), /valid JPEG, PNG or WebP/);
  const tooLarge = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(2 * 1024 * 1024),
  ]).toString('base64');
  assert.throws(() => decodeThumbnail({ mimeType: 'image/png', data: tooLarge }), (error) => error.statusCode === 413);
  await assert.rejects(uploadThumbnail('../unsafe', 'horizontal', image, { env, client: { send: async () => {} } }), /Invalid thumbnail identity/);
  await assert.rejects(uploadThumbnail(id, '../../unsafe', image, { env, client: { send: async () => {} } }), /Invalid thumbnail identity/);
});

test('clean install exposes the declared AWS S3 SDK without a second library', () => {
  const sdk = require('@aws-sdk/client-s3');
  assert.equal(typeof sdk.S3Client, 'function');
  assert.equal(typeof sdk.PutObjectCommand, 'function');
  const source = fs.readFileSync(path.join(__dirname, '../services/thumbnailCdn.js'), 'utf8');
  assert.ok(!source.includes('AWS_ACCESS_KEY_ID'));
  assert.ok(!source.includes('AWS_SECRET_ACCESS_KEY'));
  assert.match(source, /new S3Client\(\{ region \}\)/);
});

test('production rejects local, IP, and EC2-hosted thumbnail URLs', () => {
  const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const start = source.indexOf('function sanitizeOptionalUrl');
  const end = source.indexOf('const MAX_THUMBNAIL_BYTES', start);
  const module = { exports: {} };
  vm.runInNewContext(`${source.slice(start, end)}\nmodule.exports = { sanitizeCourseThumbnailUrl };`, {
    module,
    URL,
    encodeURIComponent,
    isProduction: true,
    net,
  });
  const sanitize = module.exports.sanitizeCourseThumbnailUrl;
  assert.equal(sanitize('https://images.example.test/course.png'), 'https://images.example.test/course.png');
  assert.throws(() => sanitize('/uploads/course-thumbnails/local.png'), /shared HTTPS storage/);
  assert.throws(() => sanitize('http://127.0.0.1/course.png'), /shared HTTPS storage/);
  assert.throws(() => sanitize('https://1.2.3.4/course.png'), /shared HTTPS storage/);
  assert.throws(() => sanitize('https://ec2-1-2-3-4.compute-1.amazonaws.com/course.png'), /shared HTTPS storage/);
});

function routeHandler(routeStart, routeEnd, context, method) {
  const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const start = source.indexOf(routeStart);
  const snippet = source.slice(start, source.indexOf(routeEnd, start));
  let handler;
  const app = {
    [method](_route, _guard, callback) { handler = callback; },
  };
  vm.runInNewContext(snippet, { ...context, app });
  return handler;
}

function responseRecorder() {
  return {
    body: null,
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

test('failed replacement upload returns 503 before loading or saving the mutable course document', async () => {
  const previous = { thumbnailUrl: 'https://images.example.test/old.png', thumbnailVerticalUrl: null, videos: [], completionOrder: [] };
  let findCalls = 0;
  let saveCalls = 0;
  const Course = {
    findById() {
      findCalls += 1;
      if (findCalls > 1) throw new Error('Mutable course must not load after upload failure');
      return { select: async () => previous };
    },
  };
  const handler = routeHandler("app.patch('/api/admin/courses/:id'", "app.get('/api/admin/courses/:id'", {
    protectAdmin() {},
    mongoose: { Types: { ObjectId: { isValid: () => true } } },
    Course,
    Lesson: { bulkWrite: async () => {} },
    parseThumbnailDataUrl: () => image,
    saveThumbnailUpload: async () => { throw Object.assign(new Error('Storage temporarily unavailable.'), { statusCode: 503 }); },
    sanitizeCourseThumbnailUrl: (value) => value,
    sanitizeOptionalUrl: (value) => value,
    sanitizeCourseVideos: (value) => value,
    applyCourseThumbnailToVideos: (value) => value,
    clearPublicCourseCaches: async () => {},
  }, 'patch');
  previous.save = async () => { saveCalls += 1; };
  const res = responseRecorder();
  await handler({ params: { id }, body: { thumbnailDataUrl: 'data:image/png;base64,...' } }, res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, 'Storage temporarily unavailable.');
  assert.equal(previous.thumbnailUrl, 'https://images.example.test/old.png');
  assert.equal(findCalls, 1);
  assert.equal(saveCalls, 0);
});

test('failed production upload prevents course construction and database persistence', async () => {
  let constructed = 0;
  class ObjectId {
    static isValid() { return true; }
    toString() { return id; }
  }
  function Course() { constructed += 1; }
  const handler = routeHandler("app.post('/api/courses'", "app.get('/api/admin/courses'", {
    protectAdmin() {},
    mongoose: { Types: { ObjectId } },
    Course,
    sanitizeCourseVideos: (videos) => videos,
    parseThumbnailDataUrl: (value) => value ? image : null,
    saveThumbnailUpload: async () => { throw Object.assign(new Error('Storage temporarily unavailable.'), { statusCode: 503 }); },
    sanitizeCourseThumbnailUrl: (value) => value,
    applyCourseThumbnailToVideos: (videos) => videos,
    clearPublicCourseCaches: async () => {},
  }, 'post');
  const res = responseRecorder();
  await handler({ body: { category: id, videos: [{}], thumbnailDataUrl: 'data:image/png;base64,...' } }, res);

  assert.equal(res.statusCode, 503);
  assert.equal(constructed, 0);
});

test('blank vertical URL clears legacy storage while preserving the horizontal thumbnail', async () => {
  const horizontal = 'https://images.example.test/course-horizontal.webp';
  const existingCourse = {
    thumbnailUrl: horizontal,
    thumbnailVerticalUrl: `/uploads/course-thumbnails/${id}-vertical.webp`,
    thumbnail: null,
    thumbnailHorizontal: null,
    thumbnailVertical: null,
    videos: [],
    completionOrder: [],
  };
  let findCalls = 0;
  let saveCalls = 0;
  const mutableCourse = {
    ...existingCourse,
    validate: async () => {},
    save: async () => { saveCalls += 1; },
    populate: async () => {},
    toObject() { return { thumbnailUrl: this.thumbnailUrl, thumbnailVerticalUrl: this.thumbnailVerticalUrl }; },
  };
  const Course = {
    findById() {
      findCalls += 1;
      return findCalls === 1
        ? { select: async () => existingCourse }
        : Promise.resolve(mutableCourse);
    },
  };
  const handler = routeHandler("app.patch('/api/admin/courses/:id'", "app.get('/api/admin/courses/:id'", {
    protectAdmin() {},
    mongoose: { Types: { ObjectId: { isValid: () => true } } },
    Course,
    Lesson: { bulkWrite: async () => {} },
    sanitizeCourseThumbnailUrl: (value) => String(value || '').trim() || null,
    sanitizeOptionalUrl: (value) => value,
    parseThumbnailDataUrl: () => null,
    saveThumbnailUpload: async () => null,
    sanitizeCourseVideos: (value) => value,
    applyCourseThumbnailToVideos: (value) => value,
    clearPublicCourseCaches: async () => {},
  }, 'patch');
  const res = responseRecorder();
  await handler({ params: { id }, body: { thumbnailVerticalUrl: '' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(mutableCourse.thumbnailVerticalUrl, null);
  assert.equal(mutableCourse.thumbnailUrl, horizontal);
  assert.equal(res.body.thumbnailVerticalUrl, null);
  assert.equal(res.body.thumbnailUrl, horizontal);
  assert.equal(saveCalls, 1);
});

test('course thumbnail API helper tolerates no vertical thumbnail and retains horizontal fallback', () => {
  const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const start = source.indexOf('function publicCourseThumbnailUrl');
  const end = source.indexOf('function parseThumbnailDataUrl', start);
  const module = { exports: {} };
  vm.runInNewContext(`${source.slice(start, end)}\nmodule.exports = { publicCourseThumbnailUrl };`, {
    module,
    storedThumbnailUrl: () => null,
    localThumbnailFileExists: () => false,
    hasStoredThumbnail: () => false,
  });
  const horizontal = 'https://images.example.test/course-horizontal.webp';
  const course = { _id: id, thumbnailUrl: horizontal, thumbnailVerticalUrl: null };

  assert.equal(module.exports.publicCourseThumbnailUrl(course), horizontal);
  assert.equal(module.exports.publicCourseThumbnailUrl(course, 'vertical'), horizontal);
});
