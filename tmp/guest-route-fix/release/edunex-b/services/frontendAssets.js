const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LONG_LIVED_STATIC_EXTENSIONS = /\.(?:avif|gif|ico|jpe?g|png|svg|webp|woff2?)$/i;
const SHORT_LIVED_STATIC_EXTENSIONS = /\.(?:css|js|json|map|webmanifest)$/i;
const MARKETING_COURSEWEB_PREFIX = 'static-pages/skillomate-ai-influencer-courseweb/';

function frontendRelativePath(filePath, frontendDir) {
  return path.relative(frontendDir, filePath).split(path.sep).join('/');
}

function frontendCacheControl(filePath, frontendDir) {
  if (/\.html?$/i.test(filePath)) return 'no-store';

  const relativePath = frontendRelativePath(filePath, frontendDir);
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

function isMarketingCourseWebHtml(filePath, frontendDir) {
  const relativePath = frontendRelativePath(filePath, frontendDir);
  return relativePath.startsWith(MARKETING_COURSEWEB_PREFIX) && /\.html?$/i.test(relativePath);
}

function marketingCourseWebCspHeader(connectSources = ["'self'", 'https:', 'wss:']) {
  const uniqueConnectSources = [...new Set(connectSources.filter(Boolean))];
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com",
    "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
    "style-src 'self' 'unsafe-inline' https:",
    "img-src 'self' data: blob: https:",
    "worker-src 'self' blob:",
    "media-src 'self' blob: https:",
    "font-src 'self' data: https:",
    `connect-src ${uniqueConnectSources.join(' ')}`,
    "frame-ancestors 'none'",
  ].join('; ');
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
  isMarketingCourseWebHtml,
  inlineScriptCspHash,
  marketingCourseWebCspHeader,
};
