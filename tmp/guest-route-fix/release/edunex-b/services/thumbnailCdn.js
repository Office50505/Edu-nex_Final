const { createHash } = require('node:crypto');
const net = require('node:net');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;
const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
let sharedClient = null;
let sharedClientRegion = '';

function uploadError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function decodeThumbnail(image) {
  const extension = EXTENSIONS[image?.mimeType];
  const encoded = String(image?.data || '').replace(/\s/g, '');
  if (!extension || !encoded || !/^[a-z0-9+/]+={0,2}$/i.test(encoded) || encoded.length % 4 === 1) {
    throw uploadError('Thumbnail must be a valid JPEG, PNG or WebP image under 2 MB.', 400);
  }
  const body = Buffer.from(encoded, 'base64');
  const canonical = body.toString('base64').replace(/=+$/, '');
  if (!body.length || body.length > MAX_THUMBNAIL_BYTES || canonical !== encoded.replace(/=+$/, '')) {
    throw uploadError('Thumbnail must be a valid JPEG, PNG or WebP image under 2 MB.', body.length > MAX_THUMBNAIL_BYTES ? 413 : 400);
  }
  const validSignature = image.mimeType === 'image/jpeg'
    ? body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff
    : image.mimeType === 'image/png'
      ? body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : body.length >= 12 && body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!validSignature) {
    throw uploadError('Thumbnail content does not match its image type.', 400);
  }
  return { body, extension };
}

function validateIdentity(courseId, orientation) {
  if (!/^[a-f0-9]{24}$/i.test(String(courseId)) || !/^(horizontal|vertical|video-[a-f0-9]{24})$/i.test(orientation)) {
    throw uploadError('Invalid thumbnail identity.', 400);
  }
}

function s3Client(region) {
  if (!sharedClient || sharedClientRegion !== region) {
    sharedClient?.destroy();
    // No credentials are supplied: the AWS SDK default provider chain uses the EC2 IAM role.
    sharedClient = new S3Client({ region });
    sharedClientRegion = region;
  }
  return sharedClient;
}

function sharedThumbnailUrl({ base, bucket, key, region }) {
  if (base) {
    const url = new URL(base);
    const hostname = url.hostname.toLowerCase();
    const localOrInstanceHost = hostname === 'localhost'
      || hostname.endsWith('.local')
      || net.isIP(hostname) !== 0
      || /^ec2-[a-z0-9-]+\.compute(?:-[0-9]+)?\.amazonaws\.com$/i.test(hostname);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || localOrInstanceHost) {
      throw uploadError('Thumbnail CDN base must be a permanent HTTPS URL.', 503);
    }
    return `${base.replace(/\/+$/, '')}/${key}`;
  }
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return `https://s3.${region}.amazonaws.com/${encodeURIComponent(bucket)}/${encodedKey}`;
}

async function uploadThumbnail(courseId, orientation, image, options = {}) {
  if (!image?.data) return null;
  const env = options.env || process.env;
  const { THUMBNAIL_S3_BUCKET: bucket, THUMBNAIL_CDN_BASE_URL: base } = env;
  const region = env.THUMBNAIL_S3_REGION || env.AWS_REGION;
  validateIdentity(courseId, orientation);
  const { body, extension } = decodeThumbnail(image);
  if (!bucket || !region || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || !/^[a-z0-9-]+$/.test(region)) {
    throw uploadError('Thumbnail storage is not configured.', 503);
  }
  // Content-addressed filenames avoid stale CDN copies after an edit.
  const key = `course-thumbnails/${courseId}/${orientation}-${createHash('sha256').update(body).digest('hex')}.${extension}`;
  const finalUrl = sharedThumbnailUrl({ base, bucket, key, region });
  const client = options.client || s3Client(region);
  try {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: image.mimeType, CacheControl: 'public, max-age=31536000, immutable' }), { abortSignal: AbortSignal.timeout(15000) });
  } catch {
    throw uploadError('Storage temporarily unavailable.', 503);
  }
  return finalUrl;
}

module.exports = { decodeThumbnail, uploadThumbnail };
