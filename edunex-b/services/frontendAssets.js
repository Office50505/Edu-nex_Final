const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LONG_LIVED_STATIC_EXTENSIONS = /\.(?:avif|gif|ico|jpe?g|png|svg|webp|woff2?)$/i;
const SHORT_LIVED_STATIC_EXTENSIONS = /\.(?:css|js|json|map|webmanifest)$/i;

function frontendCacheControl(filePath, frontendDir) {
  if (/\.html?$/i.test(filePath)) return 'no-store';

  const relativePath = path.relative(frontendDir, filePath).split(path.sep).join('/');
  const isHashedBuildAsset = /^assets\/.*-[A-Za-z0-9_-]{8,}\.[^.]+$/i.test(relativePath);
  const isVersionedStaticAsset = /-v\d+\.[^.]+$/i.test(relativePath);

  if (isHashedBuildAsset || isVersionedStaticAsset) {
    return 'public, max-age=31536000, immutable';
  }
  if (LONG_LIVED_STATIC_EXTENSIONS.test(relativePath)) {
    return 'public, max-age=2592000, stale-while-revalidate=31536000';
  }
  if (SHORT_LIVED_STATIC_EXTENSIONS.test(relativePath)) {
    return 'public, max-age=604800, stale-while-revalidate=2592000';
  }
  return '';
}

function inlineScriptCspHash(indexPath, scriptId) {
  if (!fs.existsSync(indexPath)) return '';
  const html = fs.readFileSync(indexPath, 'utf8');
  const idMarker = `id="${scriptId}"`;
  const idIndex = html.indexOf(idMarker);
  if (idIndex < 0) return '';
  const scriptStart = html.lastIndexOf('<script', idIndex);
  const contentStart = html.indexOf('>', idIndex);
  const contentEnd = html.indexOf('</script>', contentStart);
  if (scriptStart < 0 || contentStart < 0 || contentEnd < 0) return '';
  const source = html.slice(contentStart + 1, contentEnd);
  const digest = crypto.createHash('sha256').update(source).digest('base64');
  return `'sha256-${digest}'`;
}

module.exports = {
  frontendCacheControl,
  inlineScriptCspHash,
};
