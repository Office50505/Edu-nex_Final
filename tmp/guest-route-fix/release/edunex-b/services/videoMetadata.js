const cf = require('./cloudFrontPlayback');
const { validateSource, problem } = require('./videoSources');

async function hlsDuration(grant, readPlaylist = cf.fetchPlaylist, depth = 0, visited = new Set()) {
  if (depth >= 4 || visited.has(grant.url)) throw problem('Playlist nesting is too deep or contains a cycle. Enter duration manually.');
  visited.add(grant.url);
  const text = await readPlaylist(grant);
  const lines = text.split(/\r?\n/).map(line => line.trim());
  const variant = lines.findIndex(line => line.startsWith('#EXT-X-STREAM-INF:'));
  if (variant >= 0) {
    const uri = lines.slice(variant + 1).find(line => line && !line.startsWith('#'));
    const token = uri && new URL(uri, 'https://local.invalid').searchParams.get('grant');
    if (!token) throw problem('Variant playlist could not be resolved.');
    return hlsDuration(cf.decodeGrant(token), readPlaylist, depth + 1, visited);
  }
  if (!lines.includes('#EXT-X-ENDLIST')) throw problem('This playlist is live or unfinished. A complete VOD playlist is needed for automatic duration.');
  const values = lines.filter(line => line.startsWith('#EXTINF:')).map(line => Number(line.slice(8).split(',')[0]));
  if (!values.length || values.some(n => !Number.isFinite(n) || n <= 0)) throw problem('Playlist has missing or invalid segment durations.');
  return Math.round(values.reduce((sum, n) => sum + n, 0) * 1000) / 1000;
}
async function inspectVideo(input, dependencies = {}) {
  const video = validateSource(input);
  if (video.provider === 'aws_cloudfront') {
    const lease = cf.issueGrant(video.videoUrl, { preview: true });
    const grant = cf.decodeGrant(new URL(lease.hlsUrl, 'https://local.invalid').searchParams.get('grant'));
    return { duration: await hlsDuration(grant, dependencies.readPlaylist), message: 'Playlist readable; duration detected. Preview to verify picture and sound.' };
  }
  if (video.provider === 'bunny_stream') {
    if (!process.env.BUNNY_STREAM_API_KEY || video.bunnyLibraryId !== process.env.BUNNY_STREAM_LIBRARY_ID) throw problem('Automatic Bunny details require the configured library and its API key. You can enter duration manually.');
    const response = await (dependencies.fetcher || fetch)(`https://video.bunnycdn.com/library/${encodeURIComponent(video.bunnyLibraryId)}/videos/${encodeURIComponent(video.bunnyVideoId)}`, { headers: { AccessKey: process.env.BUNNY_STREAM_API_KEY }, redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw problem(`Bunny returned HTTP ${response.status}. Check the library, video ID and API key.`);
    const data = await response.json();
    if (!Number.isFinite(data.length) || data.length <= 0) throw problem('Bunny duration is not available yet. Wait for processing or enter it manually.');
    return { duration: data.length, message: 'Bunny duration detected. Preview to verify playback.' };
  }
  throw problem('Enter duration manually for existing YouTube lessons.');
}
module.exports = { hlsDuration, inspectVideo };
