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
    // Older CloudFront downloads saved local HLS manifests. Expo's native player
    // does not reliably play those file-based HLS folders offline, so force a
    // fresh MP4 download through the current download flow.
    if (info.kind === 'hls' && info.provider === 'aws_cloudfront') continue;
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
    if (stat.exists && !stat.isDirectory) verified[id] = { ...info, path: target };
  }
  // Remove abandoned partial videos and duplicates from the old app-owned folder.
  if (legacyDir) await fs.deleteAsync(legacyDir, { idempotent: true });
  await storage.setItem(DOWNLOADS_STORAGE_KEY, JSON.stringify(verified));
  return verified;
}
