export const CLOUDFRONT_HOST = 'd2vntxz4x493rp.cloudfront.net';
export function inferProvider(video) {
  if(video.provider || video.sourceType)return video.provider || video.sourceType;
  if(video.youtubeId)return 'youtube';
  try { if(new URL(video.videoUrl).hostname===CLOUDFRONT_HOST)return 'aws_cloudfront'; } catch {}
  return 'bunny_stream';
}
export function videoError(video,host=CLOUDFRONT_HOST) {
  if(!['aws_cloudfront','bunny_stream','youtube'].includes(inferProvider(video)))return 'Choose AWS CloudFront or Bunny Stream.';
  if(!video.title?.trim())return 'Enter a lesson title.';
  if(inferProvider(video)==='youtube')return /^[\w-]{11}$/.test(video.youtubeId||'') ? '' : 'Invalid YouTube ID.';
  const raw=video.videoUrl;
  if(typeof raw!=='string'||/[\s\\]/.test(raw))return 'Encode spaces as %20; do not paste literal whitespace.';
  let url;try{url=new URL(raw);}catch{return 'Enter a valid HTTPS video URL.';}
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash)return 'Use HTTPS without credentials, ports or fragments.';
  for(const key of url.searchParams.keys())if(/^(expires|signature|policy|key-pair-id|hash-algorithm|token|token_path|x-amz-.+)$/i.test(key))return 'Use a permanent URL without expiring signatures or tokens.';
  if(inferProvider(video)==='aws_cloudfront' && raw.includes('*'))return 'Encode literal asterisks as %2A.';
  if(inferProvider(video)==='aws_cloudfront')return url.hostname===host && /\.m3u8(?:%20)*$/i.test(url.pathname) ? '' : `Use an HTTPS .m3u8 URL from ${host}.`;
  if(!['player.mediadelivery.net','iframe.mediadelivery.net','video.bunnycdn.com'].includes(url.hostname)&&!url.hostname.endsWith('.b-cdn.net'))return 'Use a Bunny Stream embed, play or CDN URL.';
  if(!url.hostname.endsWith('.b-cdn.net') && !/^\/(embed|play)\/\d+\/[A-Za-z0-9-]+(?:\/|$)/.test(url.pathname))return 'Bunny URL must contain a library ID and video ID.';
  return '';
}
// Decode only display titles. The saved URL always remains the original string.
export function titleFromUrl(raw) {
  const parts = new URL(raw).pathname.split('/').filter(Boolean).map(part => {
    try { return decodeURIComponent(part).trim(); } catch { return part; }
  });
  let name = (parts.pop() || '').replace(/\.m3u8$/i, '');
  if (/^(master|playlist|index|main|manifest)$/i.test(name)) name = parts.pop() || name;
  return name.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) || 'Untitled lesson';
}
export function importLessons(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  const lessons = [];
  const numbers = new Set(), urls = new Set();
  for (let i = 0; i < lines.length; i++) {
    let title, url, number;
    if (/^https:\/\/\S+$/i.test(lines[i].trim())) {
      url = lines[i].trim(); title = titleFromUrl(url);
    } else {
      const match = lines[i].match(/^\s*(\d+)[.)]\s+(.+?)(?:\s*\|\s*|\s+)(https:\/\/\S+)\s*$/);
      if (match) [, number, title, url] = match;
      else {
        const heading = lines[i].match(/^\s*(\d+)[.)]\s+(.+)$/);
        if (!heading || !/^https:\/\/\S+$/i.test(lines[i+1]?.trim() || '')) throw new Error(`Line ${i+1}: paste an HTTPS URL, or a numbered title followed by its URL.`);
        [, number, title] = heading; url = lines[++i].trim();
      }
    }
    if (number && numbers.has(Number(number))) throw new Error('Lesson numbers must be unique.');
    if (number) numbers.add(Number(number));
    if (urls.has(url)) throw new Error('The import contains a duplicate video URL.');
    urls.add(url);
    lessons.push({title:title.trim(),videoUrl:url,order:number ? Number(number) : Number(title.match(/^(?:lesson\s*)?(\d+)/i)?.[1]) || null,provider:inferProvider({videoUrl:url})});
  }
  if (!lessons.length) throw new Error('Paste at least one lesson URL.');
  if (lessons.length > 500) throw new Error('Import at most 500 lessons.');
  return lessons.sort((a,b)=>(a.order ?? Infinity)-(b.order ?? Infinity)).map((lesson,index)=>({...lesson,order:index+1}));
}
