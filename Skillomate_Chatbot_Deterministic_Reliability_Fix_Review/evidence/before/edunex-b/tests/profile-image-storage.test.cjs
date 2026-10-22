const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  MAX_PROFILE_IMAGE_BYTES,
  deleteProfileImage,
  uploadProfileImage,
  validateImage,
} = require('../services/profileImageStorage');

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x01]);

test('profile image validation checks MIME, signature, presence and size', () => {
  assert.equal(validateImage(jpeg, 'image/jpeg'), 'jpg');
  assert.throws(() => validateImage(Buffer.from('not an image'), 'image/jpeg'), /does not match/);
  assert.throws(() => validateImage(jpeg, 'application/octet-stream'), /JPEG, PNG, or WebP/);
  assert.throws(() => validateImage(Buffer.alloc(0), 'image/jpeg'), /choose a profile photo/i);
  assert.throws(() => validateImage(Buffer.alloc(MAX_PROFILE_IMAGE_BYTES + 1), 'image/jpeg'), /smaller than 5 MB/);
});

test('production profile upload uses durable S3 storage and a permanent HTTPS URL', async () => {
  const calls = [];
  const result = await uploadProfileImage('user-1', jpeg, 'image/jpeg', {
    env: {
      NODE_ENV: 'production',
      PROFILE_IMAGE_S3_BUCKET: 'skillomate-profile-images',
      PROFILE_IMAGE_S3_REGION: 'ap-south-1',
      PROFILE_IMAGE_CDN_BASE_URL: 'https://media.skillomate.in',
    },
    client: { send: async command => { calls.push(command.input); } },
  });
  assert.match(result.key, /^profile-images\/user-1\/[a-f0-9]{64}\.jpg$/);
  assert.equal(result.url, `https://media.skillomate.in/${result.key}`);
  assert.equal(calls[0].Bucket, 'skillomate-profile-images');
  assert.equal(calls[0].ContentType, 'image/jpeg');
  assert.equal(calls[0].Body, jpeg);
});

test('development fallback stores image bytes durably and deletion cannot escape upload root', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skillomate-profile-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = { NODE_ENV: 'development', UPLOADS_DIR: root };
  const uploaded = await uploadProfileImage('user-2', jpeg, 'image/jpeg', { env });
  const target = path.join(root, uploaded.key);
  assert.equal(fs.readFileSync(target).equals(jpeg), true);
  assert.equal(await deleteProfileImage(uploaded.key, { env }), true);
  assert.equal(fs.existsSync(target), false);
  assert.equal(await deleteProfileImage('../outside.jpg', { env }), false);
});

test('production without shared storage fails closed instead of saving a device-local URI', async () => {
  await assert.rejects(
    uploadProfileImage('user-3', jpeg, 'image/jpeg', { env: { NODE_ENV: 'production' } }),
    /storage is not configured/,
  );
});
