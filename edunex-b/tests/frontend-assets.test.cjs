const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { frontendCacheControl, inlineScriptCspHash } = require('../services/frontendAssets');

test('frontend assets receive cache policies that match their revision strategy', () => {
  const root = path.join('/srv', 'skillomate', 'dist');
  assert.equal(frontendCacheControl(path.join(root, 'index.html'), root), 'no-store');
  assert.equal(
    frontendCacheControl(path.join(root, 'assets', 'index-WR94sBMx.css'), root),
    'public, max-age=31536000, immutable',
  );
  assert.equal(
    frontendCacheControl(path.join(root, 'assets', 'skillomate-logo-dark-v1.webp'), root),
    'public, max-age=31536000, immutable',
  );
  assert.equal(
    frontendCacheControl(path.join(root, 'assets', 'male1.jpeg'), root),
    'public, max-age=2592000, stale-while-revalidate=31536000',
  );
  assert.equal(
    frontendCacheControl(path.join(root, 'js', 'legacy.js'), root),
    'public, max-age=604800, stale-while-revalidate=2592000',
  );
});

test('inline theme script hashes are derived from the built HTML source', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'skillomate-assets-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const indexPath = path.join(directory, 'index.html');
  fs.writeFileSync(indexPath, '<script id="skillomate-theme-preload">window.theme="noir";</script>');
  assert.match(inlineScriptCspHash(indexPath, 'skillomate-theme-preload'), /^'sha256-[A-Za-z0-9+/]+=*'$/);
  assert.equal(inlineScriptCspHash(indexPath, 'missing-script'), '');
});
