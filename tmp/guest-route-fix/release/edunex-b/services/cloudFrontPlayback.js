const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { parseHttps, validateCloudFront, cloudFrontHost, problem } = require('./videoSources');
const TTL_SECONDS = 900;
function mode() {
  const value=process.env.CLOUDFRONT_ACCESS_MODE || 'private';
  if(!['private','public'].includes(value))throw problem('CLOUDFRONT_ACCESS_MODE must be private or public.');
  return value;
}
function secret() { if(!process.env.JWT_SECRET)throw new Error('JWT_SECRET is required for playback grants.');return process.env.JWT_SECRET; }
function encoded(buffer) { return Buffer.from(buffer).toString('base64').replace(/\+/g,'-').replace(/=/g,'_').replace(/\//g,'~'); }
let cachedPem, cachedKey;
function signingKey(config) {
  const pem = config.CLOUDFRONT_PRIVATE_KEY?.replace(/\\n/g,'\n');
  if (!pem || !config.CLOUDFRONT_PUBLIC_KEY_ID) throw Object.assign(new Error('Private CloudFront playback needs CLOUDFRONT_PRIVATE_KEY and CLOUDFRONT_PUBLIC_KEY_ID on the backend.'),{statusCode:503});
  if (pem !== cachedPem) {
    const key = crypto.createPrivateKey(pem);
    if (key.asymmetricKeyType !== 'rsa') throw problem('CloudFront playback requires an RSA signing key.');
    cachedKey = key; cachedPem = pem;
  }
  return cachedKey;
}
function signedUrl(raw, expiresAt, config = process.env) {
  if(raw.includes('*'))throw problem('Encode literal asterisks as %2A in HLS references.');
  if((config.CLOUDFRONT_ACCESS_MODE || 'private')==='public')return raw;
  const key=signingKey(config);
  const keyId=config.CLOUDFRONT_PUBLIC_KEY_ID;
  // Canned policy covers this exact resource including the original query, not the entire distribution.
  const policy=JSON.stringify({Statement:[{Resource:raw,Condition:{DateLessThan:{'AWS:EpochTime':expiresAt}}}]});
  const signature=crypto.sign('RSA-SHA1',Buffer.from(policy),key);
  return `${raw}${raw.includes('?')?'&':'?'}Expires=${expiresAt}&Signature=${encoded(signature)}&Key-Pair-Id=${encodeURIComponent(keyId)}`;
}
function issueGrant(reference, identity) {
  validateCloudFront(reference);mode();
  const expiresAt=Math.floor(Date.now()/1000)+TTL_SECONDS;
  if (mode() === 'private') signingKey(process.env); // Validate before issuing a grant without a redundant signature.
  const token=jwt.sign({...identity,reference,url:reference,root:new URL('.',reference).href,expiresAt},secret(),{algorithm:'HS256',audience:'cloudfront-hls',expiresIn:TTL_SECONDS});
  return {provider:'aws_cloudfront',sourceType:'aws_cloudfront',hlsUrl:`/api/playback/hls.m3u8?grant=${encodeURIComponent(token)}`,expiresAt:expiresAt*1000};
}
function decodeGrant(token) { return jwt.verify(token,secret(),{algorithms:['HS256'],audience:'cloudfront-hls'}); }
function scopedProxyUrl(raw, grant, endpoint) {
  const remaining=grant.expiresAt-Math.floor(Date.now()/1000);
  if(remaining<=0)throw problem('Playback grant expired.');
  const {iat,exp,aud,...payload}=grant;
  const token=jwt.sign({...payload,url:raw},secret(),{algorithm:'HS256',audience:'cloudfront-hls',expiresIn:remaining});
  return `/api/playback/${endpoint}?grant=${encodeURIComponent(token)}`;
}
function resolveResource(reference, base, root) {
  const raw=/^https:\/\//i.test(reference) ? reference : new URL(reference,base).href;
  const parsed=parseHttps(raw),scope=new URL(root);
  if(parsed.hostname!==cloudFrontHost() || parsed.hostname!==scope.hostname)throw problem('HLS references a host outside the configured CloudFront distribution.');
  // Reject encoded path separators/dot segments that could bypass the asset-directory boundary.
  const decoded=decodeURIComponent(parsed.pathname), rootPath=decodeURIComponent(scope.pathname);
  if(!parsed.pathname.startsWith(scope.pathname)||!decoded.startsWith(rootPath)||decoded.split('/').some(part=>part==='..'||part==='.')||/%(?:2f|5c|2e)/i.test(parsed.pathname))throw problem('HLS resource escapes its lesson directory.');
  return raw;
}
function rewritePlaylist(text, grant) {
  if(!text.startsWith('#EXTM3U'))throw problem('CloudFront did not return a valid HLS playlist.');
  if(/#EXT-X-DEFINE|\{\$/.test(text))throw problem('HLS variable substitution is not supported. Use a resolved VOD playlist.');
  const rewrite=(reference,playlist=false)=>{
    const raw=resolveResource(reference,grant.url,grant.root);
    if(playlist || /\.m3u8(?:%20)*$/i.test(new URL(raw).pathname)) {
      return scopedProxyUrl(raw,grant,'hls.m3u8');
    }
    // The bundled Linux ARM FFmpeg cannot reliably resolve CloudFront DNS.
    // Keep download conversion on loopback and let Node fetch signed resources.
    if(grant.download)return scopedProxyUrl(raw,grant,'resource');
    return signedUrl(raw,grant.expiresAt);
  };
  let variantNext=false;
  return text.split(/\r?\n/).map(line=>{
    if(!line.trim())return line;
    if(line.startsWith('#')) {
      if(line.startsWith('#EXT-X-STREAM-INF:'))variantNext=true;
      return line.replace(/URI="([^"]+)"/g,(_all,uri)=>`URI="${rewrite(uri,/^#EXT-X-(MEDIA|I-FRAME-STREAM-INF):/.test(line))}"`);
    }
    const result=rewrite(line.trim(),variantNext);variantNext=false;return result;
  }).join('\n');
}
async function fetchPlaylist(grant, fetcher=fetch) {
  resolveResource(grant.url,grant.url,grant.root);
  const response=await fetcher(signedUrl(grant.url,grant.expiresAt),{redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Object.assign(new Error(`CloudFront returned HTTP ${response.status}. Check object path, signing key group and distribution permissions.`),{statusCode:502});
  if(Number(response.headers.get('content-length'))>1024*1024)throw problem('Playlist exceeds the 1 MB limit.');
  const reader=response.body.getReader();let length=0,chunks=[];
  try {while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>1024*1024)throw problem('Playlist exceeds the 1 MB limit.');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}
  return rewritePlaylist(Buffer.concat(chunks).toString('utf8'),grant);
}
async function fetchResource(grant, range, fetcher=fetch) {
  if(!grant.download)throw Object.assign(new Error('Resource proxy requires a download grant.'),{statusCode:403});
  const raw=resolveResource(grant.url,grant.reference,grant.root);
  const headers={};
  if(range) {
    if(!/^bytes=\d*-\d*$/.test(range))throw problem('Invalid media byte range.');
    headers.Range=range;
  }
  const response=await fetcher(signedUrl(raw,grant.expiresAt),{headers,redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Object.assign(new Error(`CloudFront returned HTTP ${response.status} for a download resource.`),{statusCode:502});
  return response;
}
module.exports={TTL_SECONDS,signedUrl,issueGrant,decodeGrant,resolveResource,rewritePlaylist,fetchPlaylist,fetchResource};
