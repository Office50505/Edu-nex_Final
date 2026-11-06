const sharp = require('sharp');

const DEFAULT_QUALITY = 76;
const MIN_WIDTH = 64;
const MAX_WIDTH = 1600;
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;

function optionalInteger(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    const error = new Error(`${label} must be a positive integer`);
    error.statusCode = 400;
    throw error;
  }
  return parsed;
}

function imageVariantFromQuery(query = {}) {
  const requestedWidth = optionalInteger(query.w ?? query.width, 'Image width');
  if (!requestedWidth) return { width: 0, quality: DEFAULT_QUALITY };

  const requestedQuality = optionalInteger(query.q ?? query.quality, 'Image quality');
  return {
    width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, requestedWidth)),
    quality: Math.max(45, Math.min(90, requestedQuality || DEFAULT_QUALITY)),
  };
}

function assertSourceSize(contentLength, actualBytes = 0) {
  const declaredBytes = Number(contentLength || 0);
  if ((declaredBytes > 0 && declaredBytes > MAX_SOURCE_BYTES) || actualBytes > MAX_SOURCE_BYTES) {
    const error = new Error('Image is too large to process');
    error.statusCode = 413;
    throw error;
  }
}

async function optimizeImageBuffer(buffer, contentType, variant) {
  if (!variant?.width || /(?:svg|gif)/i.test(String(contentType || ''))) {
    return { buffer, contentType };
  }

  const optimized = await sharp(buffer, { failOn: 'error', limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: variant.width, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: variant.quality, effort: 4, smartSubsample: true })
    .toBuffer();

  if (optimized.length >= buffer.length) return { buffer, contentType };
  return { buffer: optimized, contentType: 'image/webp' };
}

module.exports = {
  DEFAULT_QUALITY,
  MAX_SOURCE_BYTES,
  imageVariantFromQuery,
  assertSourceSize,
  optimizeImageBuffer,
};
