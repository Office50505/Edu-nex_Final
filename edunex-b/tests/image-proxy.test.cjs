const assert = require('node:assert/strict');
const test = require('node:test');
const sharp = require('sharp');
const {
  DEFAULT_QUALITY,
  MAX_SOURCE_BYTES,
  assertSourceSize,
  imageVariantFromQuery,
  optimizeImageBuffer,
} = require('../services/imageProxy');

test('image variants validate and bound requested dimensions', () => {
  assert.deepEqual(imageVariantFromQuery({}), { width: 0, quality: DEFAULT_QUALITY });
  assert.deepEqual(imageVariantFromQuery({ w: '640', q: '72' }), { width: 640, quality: 72 });
  assert.deepEqual(imageVariantFromQuery({ width: '9999', quality: '100' }), { width: 1600, quality: 90 });
  assert.deepEqual(imageVariantFromQuery({ w: '10', q: '10' }), { width: 64, quality: 45 });
  assert.throws(() => imageVariantFromQuery({ w: 'wide' }), /positive integer/);
});

test('oversized proxy sources are rejected before and after download', () => {
  assert.doesNotThrow(() => assertSourceSize(MAX_SOURCE_BYTES));
  assert.throws(() => assertSourceSize(MAX_SOURCE_BYTES + 1), { statusCode: 413 });
  assert.throws(() => assertSourceSize(0, MAX_SOURCE_BYTES + 1), { statusCode: 413 });
});

test('large thumbnails are resized and encoded as WebP', async () => {
  const source = await sharp({
    create: { width: 1366, height: 768, channels: 3, background: '#c58b2a' },
  }).jpeg({ quality: 92 }).toBuffer();
  const result = await optimizeImageBuffer(source, 'image/jpeg', { width: 640, quality: 72 });
  const metadata = await sharp(result.buffer).metadata();

  assert.equal(result.contentType, 'image/webp');
  assert.equal(metadata.width, 640);
  assert.equal(metadata.height, 360);
  assert.ok(result.buffer.length < source.length);
});

test('the original response is retained when no variant is requested', async () => {
  const source = Buffer.from('unchanged');
  const result = await optimizeImageBuffer(source, 'image/png', { width: 0, quality: 76 });
  assert.equal(result.buffer, source);
  assert.equal(result.contentType, 'image/png');
});
