// Video bytes belong only in the app's private, OS-purgeable cache.
export const DOWNLOADS_STORAGE_KEY = 'skillomate_downloads_v1';
export function downloadPath(fs, id) {
  if (!fs.cacheDirectory) throw new Error('Temporary storage is unavailable.');
  if (!/^[a-zA-Z0-9_-]+$/.test(String(id))) throw new Error('Invalid video download ID.');
  return `${fs.cacheDirectory}skillomate_dl/${id}.mp4`;
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
    if (info?.status !== 'done' || !/^[a-zA-Z0-9_-]+$/.test(id)) continue;
    const target = downloadPath(fs, id);
    const legacy = legacyDir && `${legacyDir}${id}.mp4`;
    if (info.path !== target && info.path !== legacy) continue;
    if (info.path === legacy && (await fs.getInfoAsync(legacy)).exists) {
      if (!(await fs.getInfoAsync(target)).exists) await fs.moveAsync({ from: legacy, to: target });
    }
    const stat = await fs.getInfoAsync(target);
    if (stat.exists && !stat.isDirectory) verified[id] = { ...info, path: target };
  }
  // Remove abandoned partial videos and duplicates from the old app-owned folder.
  if (legacyDir) await fs.deleteAsync(legacyDir, { idempotent: true });
  await storage.setItem(DOWNLOADS_STORAGE_KEY, JSON.stringify(verified));
  return verified;
}
