const fs = require('node:fs');
const path = require('node:path');
const { decodeThumbnail, uploadThumbnail } = require('./thumbnailCdn');

function storageUnavailable() {
  return Object.assign(new Error('Storage temporarily unavailable.'), { statusCode: 503 });
}

async function saveThumbnailUpload(courseId, orientation, image, options = {}) {
  if (!image?.data) return null;

  const env = options.env || process.env;
  const logger = options.logger || console;
  const uploader = options.uploadThumbnail || uploadThumbnail;
  try {
    const sharedUrl = await uploader(courseId, orientation, image, {
      env,
      ...(options.client ? { client: options.client } : {}),
    });
    if (!sharedUrl || !/^https:\/\//i.test(sharedUrl)) throw storageUnavailable();
    return sharedUrl;
  } catch (error) {
    if ([400, 413].includes(error?.statusCode)) throw error;
    if (env.NODE_ENV === 'production') {
      logger.warn('[THUMBNAIL] Shared storage upload failed; production request rejected.');
      throw storageUnavailable();
    }
    logger.warn('[THUMBNAIL] Shared storage unavailable; using development-only local storage.');
  }

  if (!/^[a-f0-9]{24}$/i.test(String(courseId)) || !/^(horizontal|vertical)$/i.test(orientation)) {
    throw Object.assign(new Error('Invalid thumbnail identity.'), { statusCode: 400 });
  }
  const { body, extension } = decodeThumbnail(image);
  const uploadDir = options.uploadDir || path.join(
    env.UPLOADS_DIR ? path.resolve(env.UPLOADS_DIR) : path.join(__dirname, '..', 'uploads'),
    'course-thumbnails'
  );
  const filename = `${courseId}-${orientation.toLowerCase()}.${extension}`;
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(path.join(uploadDir, filename), body);
  return `/uploads/course-thumbnails/${filename}`;
}

module.exports = { saveThumbnailUpload };
