const { createHash } = require('node:crypto');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

async function uploadThumbnail(courseId, orientation, image, options = {}) {
  if (!image?.data) return null;
  const env = options.env || process.env;
  const { THUMBNAIL_S3_BUCKET: bucket, THUMBNAIL_CDN_BASE_URL: base } = env;
  const region = env.THUMBNAIL_S3_REGION || env.AWS_REGION;
  if (!bucket || !base || !region) throw Object.assign(new Error('Thumbnail CDN is not configured. Set THUMBNAIL_S3_BUCKET, THUMBNAIL_S3_REGION and THUMBNAIL_CDN_BASE_URL.'), {statusCode:503});
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Thumbnail CDN base must be a permanent HTTPS URL.');
  if (!/^[a-f0-9]{24}$/i.test(String(courseId)) || !/^(horizontal|vertical|video-[a-f0-9]{24})$/i.test(orientation)) throw new Error('Invalid thumbnail identity.');
  const extension = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[image.mimeType];
  const body = Buffer.from(image.data, 'base64');
  if (!extension || !body.length || body.length > 2 * 1024 * 1024) throw Object.assign(new Error('Thumbnail must be a JPEG, PNG or WebP under 2 MB.'), {statusCode:400});
  // Content-addressed filenames avoid stale CDN copies after an edit.
  const key = `course-thumbnails/${courseId}/${orientation}-${createHash('sha256').update(body).digest('hex')}.${extension}`;
  const client = options.client || new S3Client({region});
  try {
    await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:body,ContentType:image.mimeType,CacheControl:'public, max-age=31536000, immutable'}), {abortSignal:AbortSignal.timeout(15000)});
  } finally { if (!options.client) client.destroy(); }
  return `${base.replace(/\/+$/, '')}/${key}`;
}
module.exports = { uploadThumbnail };
