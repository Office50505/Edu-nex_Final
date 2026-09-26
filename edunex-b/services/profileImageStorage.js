const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { DeleteObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');

const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function storageError(message, statusCode = 503) {
  return Object.assign(new Error(message), { statusCode });
}

function validateImage(body, mimeType) {
  if (!Buffer.isBuffer(body) || !body.length) throw storageError('Choose a profile photo to upload.', 400);
  if (body.length > MAX_PROFILE_IMAGE_BYTES) throw storageError('Profile photo must be smaller than 5 MB.', 413);
  const extension = EXTENSIONS[mimeType];
  if (!extension) throw storageError('Profile photo must be JPEG, PNG, or WebP.', 415);
  const valid = mimeType === 'image/jpeg'
    ? body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff
    : mimeType === 'image/png'
      ? body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : body.length >= 12 && body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!valid) throw storageError('Profile photo content does not match its image type.', 400);
  return extension;
}

function permanentUrl(base, bucket, region, key) {
  if (base) {
    const parsed = new URL(base);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash
      || parsed.hostname === 'localhost' || net.isIP(parsed.hostname) !== 0) {
      throw storageError('Profile image CDN must be a permanent HTTPS URL.');
    }
    return `${base.replace(/\/+$/, '')}/${key}`;
  }
  return `https://s3.${region}.amazonaws.com/${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

async function uploadProfileImage(userId, body, mimeType, options = {}) {
  const env = options.env || process.env;
  const extension = validateImage(body, mimeType);
  const bucket = env.PROFILE_IMAGE_S3_BUCKET || env.THUMBNAIL_S3_BUCKET;
  const region = env.PROFILE_IMAGE_S3_REGION || env.THUMBNAIL_S3_REGION || env.AWS_REGION;
  const base = env.PROFILE_IMAGE_CDN_BASE_URL || env.THUMBNAIL_CDN_BASE_URL;
  const digest = crypto.createHash('sha256').update(body).digest('hex');
  const key = `profile-images/${String(userId)}/${digest}.${extension}`;

  if (bucket && region) {
    const client = options.client || new S3Client({ region });
    try {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: mimeType,
        CacheControl: 'public, max-age=31536000, immutable',
      }), { abortSignal: AbortSignal.timeout(15000) });
      return { key, url: permanentUrl(base, bucket, region, key) };
    } catch (error) {
      throw storageError('Profile image storage is temporarily unavailable.');
    } finally {
      if (!options.client) client.destroy();
    }
  }

  if (env.NODE_ENV === 'production') throw storageError('Profile image storage is not configured.');
  const uploadRoot = env.UPLOADS_DIR ? path.resolve(env.UPLOADS_DIR) : path.join(__dirname, '..', 'uploads');
  const destination = path.join(uploadRoot, key);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (!fs.existsSync(destination)) fs.writeFileSync(destination, body, { flag: 'wx' });
  return { key, url: `/uploads/${key}` };
}

async function deleteProfileImage(key, options = {}) {
  if (!key || !String(key).startsWith('profile-images/')) return false;
  const env = options.env || process.env;
  const bucket = env.PROFILE_IMAGE_S3_BUCKET || env.THUMBNAIL_S3_BUCKET;
  const region = env.PROFILE_IMAGE_S3_REGION || env.THUMBNAIL_S3_REGION || env.AWS_REGION;
  if (bucket && region) {
    const client = options.client || new S3Client({ region });
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: String(key) }));
      return true;
    } finally {
      if (!options.client) client.destroy();
    }
  }
  if (env.NODE_ENV !== 'production') {
    const uploadRoot = env.UPLOADS_DIR ? path.resolve(env.UPLOADS_DIR) : path.join(__dirname, '..', 'uploads');
    const target = path.resolve(uploadRoot, String(key));
    if (target.startsWith(`${path.resolve(uploadRoot)}${path.sep}`)) fs.rmSync(target, { force: true });
    return true;
  }
  return false;
}

module.exports = { MAX_PROFILE_IMAGE_BYTES, deleteProfileImage, uploadProfileImage, validateImage };
