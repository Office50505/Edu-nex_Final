// Video bytes belong only in the app's private, OS-purgeable cache.
export const DOWNLOADS_STORAGE_KEY = 'skillomate_downloads_v1';
export function safeDownloadId(id) {
  const value = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('Invalid video download ID.');
  return value;
}
export function downloadDir(fs, id) {
  if (!fs.cacheDirectory) throw new Error('Temporary storage is unavailable.');
  return `${fs.cacheDirectory}skillomate_dl/${safeDownloadId(id)}/`;
}
export function downloadPath(fs, id) {
  return `${downloadDir(fs, id)}video.mp4`;
}
export function downloadManifestPath(fs, id) {
  return `${downloadDir(fs, id)}index.m3u8`;
}
export function hlsProgressivePath(fs, id) {
  return `${downloadDir(fs, id)}offline.ts`;
}
function stripHlsUriSuffix(uri) {
  return String(uri || '').trim().replace(/[?#].*$/, '');
}
function hlsManifestBaseDir(manifestPath) {
  const value = String(manifestPath || '');
  const slash = value.lastIndexOf('/');
  return slash >= 0 ? value.slice(0, slash + 1) : '';
}
function collectHlsResourceRefs(manifestText) {
  const refs = new Set();
  String(manifestText || '').split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    trimmed.replace(/URI="([^"]+)"/g, (_match, uri) => {
      const clean = stripHlsUriSuffix(uri);
      if (clean) refs.add(clean);
      return _match;
    });
    if (!trimmed.startsWith('#')) {
      const clean = stripHlsUriSuffix(trimmed);
      if (clean) refs.add(clean);
    }
  });
  return [...refs];
}
function localHlsResourcePath(baseDir, ref) {
  const value = String(ref || '').trim();
  if (!value || value.startsWith('//') || value.includes('..')) return '';
  if (/^file:\/\//i.test(value)) return value.startsWith(baseDir) || value.startsWith(`file://${baseDir}`) ? value : '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return '';
  return `${baseDir}${value.replace(/^\/+/, '')}`;
}
function relativeLocalHlsRef(baseDir, ref) {
  const clean = stripHlsUriSuffix(ref);
  if (!clean || clean.startsWith('//') || clean.includes('..')) return '';
  if (/^file:\/\//i.test(clean)) {
    if (!clean.startsWith(baseDir)) return '';
    return clean.slice(baseDir.length).replace(/^\/+/, '');
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(clean)) return '';
  return clean.replace(/^\/+/, '');
}
export async function normalizeLocalHlsManifest(fs, manifestPath) {
  const manifestInfo = await fs.getInfoAsync(manifestPath).catch(() => ({}));
  if (!manifestInfo.exists || manifestInfo.isDirectory) throw new Error('Incomplete offline video download.');
  const baseDir = hlsManifestBaseDir(manifestPath);
  const manifestText = await fs.readAsStringAsync(manifestPath);
  let changed = false;
  const lines = String(manifestText || '').split(/\r?\n/).map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    let nextLine = line.replace(/URI="([^"]+)"/g, (match, uri) => {
      const relative = relativeLocalHlsRef(baseDir, uri);
      if (!relative) return match;
      const replacement = `URI="${relative}"`;
      if (replacement !== match) changed = true;
      return replacement;
    });
    if (!trimmed.startsWith('#')) {
      const relative = relativeLocalHlsRef(baseDir, trimmed);
      if (relative && relative !== trimmed) changed = true;
      if (relative) nextLine = relative;
    }
    return nextLine;
  });
  if (changed) {
    await fs.writeAsStringAsync(manifestPath, lines.join('\n'));
  }
  return validateHlsDownloadBundle(fs, manifestPath);
}
export async function createLocalHlsProgressiveFile(fs, manifestPath) {
  const validation = await normalizeLocalHlsManifest(fs, manifestPath);
  // AVPlayer resolves media and key files relative to a local HLS manifest.
  // Keeping those references relative also avoids iOS rejecting file URLs
  // embedded inside a file-backed playlist. Concatenating arbitrary HLS
  // segments into a .ts file is unsafe:
  // fragmented MP4 streams require their initialization segment and Expo's
  // legacy write API does not provide binary append semantics.
  return { ...validation, playbackPath: manifestPath, playbackBytes: validation.totalBytes };
}
export async function validateHlsDownloadBundle(fs, manifestPath) {
  const manifestInfo = await fs.getInfoAsync(manifestPath).catch(() => ({}));
  if (!manifestInfo.exists || manifestInfo.isDirectory) throw new Error('Incomplete offline video download.');
  const manifestText = await fs.readAsStringAsync(manifestPath);
  if (!String(manifestText || '').startsWith('#EXTM3U')) throw new Error('Offline video manifest is invalid.');
  const refs = collectHlsResourceRefs(manifestText);
  if (!refs.length) throw new Error('Offline video has no local media segments.');
  const baseDir = hlsManifestBaseDir(manifestPath);
  let totalBytes = Number(manifestInfo.size || 0);
  for (const ref of refs) {
    const path = localHlsResourcePath(baseDir, ref);
    if (!path) throw new Error('Offline video still points to remote media.');
    const info = await fs.getInfoAsync(path).catch(() => ({}));
    if (!info.exists || info.isDirectory || Number(info.size || 0) <= 0) {
      throw new Error('Incomplete offline video download.');
    }
    totalBytes += Number(info.size || 0);
  }
  return { totalBytes, resourceCount: refs.length };
}
export async function prepareTemporaryDownloads(fs, storage) {
  if (!fs.cacheDirectory) throw new Error('Temporary storage is unavailable.');
  const cacheDir = `${fs.cacheDirectory}skillomate_dl/`;
  const legacyDir = fs.documentDirectory ? `${fs.documentDirectory}skillomate_dl/` : null;
  await fs.makeDirectoryAsync(cacheDir, { intermediates: true });
  let saved = {};
  try { saved = JSON.parse(await storage.getItem(DOWNLOADS_STORAGE_KEY) || '{}') || {}; } catch {}
  const verified = {};
  for (const [id, info] of Object.entries(saved)) {
    let safeId;
    try { safeId = safeDownloadId(id); } catch { continue; }
    if (safeId !== id || info?.status !== 'done') continue;
    const target = info.kind === 'hls' ? downloadManifestPath(fs, id) : downloadPath(fs, id);
    const legacyCache = `${cacheDir}${id}.mp4`;
    const legacy = legacyDir && `${legacyDir}${id}.mp4`;
    if (info.path !== target && info.path !== legacy && info.path !== legacyCache) continue;
    if (info.path === legacy && (await fs.getInfoAsync(legacy)).exists) {
      await fs.makeDirectoryAsync(downloadDir(fs, id), { intermediates: true });
      if (!(await fs.getInfoAsync(target)).exists) await fs.moveAsync({ from: legacy, to: target });
    }
    if (info.path === legacyCache && (await fs.getInfoAsync(legacyCache)).exists) {
      await fs.makeDirectoryAsync(downloadDir(fs, id), { intermediates: true });
      if (!(await fs.getInfoAsync(target)).exists) await fs.moveAsync({ from: legacyCache, to: target });
    }
    const stat = await fs.getInfoAsync(target);
    // The early CloudFront MP4 route could leave a tiny partial file if the
    // server-side remux was interrupted. Discard those so the lesson can be
    // downloaded again instead of opening a 1-2 second broken video.
    if (info.provider === 'aws_cloudfront' && info.kind === 'mp4' && stat.exists && Number(stat.size || 0) < 1024 * 1024) continue;
    if (info.kind === 'hls') {
      try {
        const validation = await createLocalHlsProgressiveFile(fs, target);
        verified[id] = { ...info, path: target, playbackPath: validation.playbackPath, size: validation.totalBytes };
      } catch {
        continue;
      }
    } else if (stat.exists && !stat.isDirectory) verified[id] = { ...info, path: target };
  }
  // Remove abandoned partial videos and duplicates from the old app-owned folder.
  if (legacyDir) await fs.deleteAsync(legacyDir, { idempotent: true });
  await storage.setItem(DOWNLOADS_STORAGE_KEY, JSON.stringify(verified));
  return verified;
}
