const DEFAULT_HOST = 'd2vntxz4x493rp.cloudfront.net';
function cloudFrontHost() { return process.env.CLOUDFRONT_DISTRIBUTION_HOST || DEFAULT_HOST; }
function problem(message) { return Object.assign(new Error(message), { statusCode: 400 }); }
function parseHttps(raw) {
  if(typeof raw !== 'string' || !raw || /[\s\\]/.test(raw)) throw problem('Use an HTTPS URL with spaces encoded as %20; remove literal whitespace.');
  let url;try{url=new URL(raw);}catch{throw problem('Invalid video URL.');}
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash)throw problem('Video URLs must use HTTPS without credentials, ports or fragments.');
  return url;
}
function rejectSigned(url) {
  for(const key of url.searchParams.keys()) if(/^(policy|signature|key-pair-id|hash-algorithm|expires|token|token_path|x-amz-.+)$/i.test(key))throw problem('Save the permanent video reference, not a signed or expiring playback URL.');
}
function validateCloudFront(raw) {
  const url=parseHttps(raw);
  if(raw.includes('*'))throw problem('Encode literal asterisks as %2A in CloudFront URLs.');
  if(url.hostname!==cloudFrontHost())throw problem(`AWS videos must use ${cloudFrontHost()}.`);
  if(!/\.m3u8(?:%20)*$/i.test(url.pathname))throw problem('AWS video must be an HLS .m3u8 playlist URL.');
  rejectSigned(url);
  return raw; // Do not serialize URL: case, escapes and query bytes belong to the object reference.
}
function inferProvider(video) {
  const explicit=video.provider||video.sourceType;
  if(explicit)return explicit;
  if(video.youtubeId)return 'youtube';
  try{if(new URL(video.videoUrl).hostname===cloudFrontHost())return 'aws_cloudfront';}catch{}
  return 'bunny_stream';
}
function validateSource(video) {
  const provider=inferProvider(video);
  if(!['aws_cloudfront','bunny_stream','youtube'].includes(provider))throw problem('Choose AWS CloudFront or Bunny Stream.');
  if(provider==='aws_cloudfront')return {provider,sourceType:provider,videoUrl:validateCloudFront(video.videoUrl),embedUrl:null,bunnyVideoId:null,bunnyLibraryId:null,youtubeId:null};
  if(provider==='youtube'){
    if(!/^[A-Za-z0-9_-]{11}$/.test(video.youtubeId||''))throw problem('Invalid existing YouTube video ID.');
    return {provider,sourceType:provider,youtubeId:video.youtubeId,videoUrl:null,embedUrl:`https://www.youtube.com/embed/${video.youtubeId}`,bunnyVideoId:null,bunnyLibraryId:null};
  }
  const legacyId=video.bunnyVideoId||video.bunnyGuid;
  const legacyLibrary=video.bunnyLibraryId||process.env.BUNNY_STREAM_LIBRARY_ID;
  const raw=video.videoUrl||video.embedUrl||(legacyId&&legacyLibrary?`https://player.mediadelivery.net/embed/${legacyLibrary}/${legacyId}`:'');const url=parseHttps(raw);rejectSigned(url);
  let library, id;const parts=url.pathname.split('/').filter(Boolean);
  if(['player.mediadelivery.net','iframe.mediadelivery.net','video.bunnycdn.com'].includes(url.hostname)) {
    const index=parts.findIndex(p=>p==='embed'||p==='play');if(index>=0){library=parts[index+1];id=parts[index+2];}
  }else if(url.hostname.endsWith('.b-cdn.net')) {id=parts[0];library=video.bunnyLibraryId||process.env.BUNNY_STREAM_LIBRARY_ID;}
  if(!/^\d+$/.test(library||'')||!/^[a-zA-Z0-9-]+$/.test(id||''))throw problem('Use a Bunny Stream embed/play URL containing a library ID and video ID.');
  return {provider,sourceType:provider,videoUrl:raw,embedUrl:`https://player.mediadelivery.net/embed/${library}/${id}`,bunnyVideoId:id,bunnyLibraryId:library,youtubeId:null};
}
module.exports={DEFAULT_HOST,cloudFrontHost,parseHttps,validateCloudFront,validateSource,inferProvider,problem};
