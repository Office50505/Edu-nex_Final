const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
process.env.JWT_SECRET='metadata-fixture-key';
process.env.CLOUDFRONT_ACCESS_MODE='public';
const cf=require('../services/cloudFrontPlayback');
const {hlsDuration,inspectVideo}=require('../services/videoMetadata');
const host='https://d2vntxz4x493rp.cloudfront.net';
const form=()=>import(`data:text/javascript;base64,${fs.readFileSync(require('node:path').join(__dirname,'../../edunex-f/src/pages/admin/videoForm.js')).toString('base64')}`);
test('URL-only import derives readable titles and sorts numbers without changing URL bytes',async()=>{
 const {importLessons}=await form();const raw=`${host}/Course/02_Second%20Lesson/master.M3U8%20?Case=A%2fb`;
 const lessons=importLessons(`${raw}\n${host}/Course/01_First-Lesson.m3u8`);
 assert.equal(lessons[0].title,'01 First Lesson');assert.equal(lessons[1].title,'02 Second Lesson');assert.equal(lessons[1].videoUrl,raw);assert.deepEqual(lessons.map(v=>v.order),[1,2]);
});
test('mixed numbered titles and URL-only imports preserve explicit titles and reject duplicates',async()=>{
 const {importLessons}=await form();const raw=`${host}/01_Intro/master.m3u8`;
 assert.throws(()=>importLessons(`${raw}\n${raw}`),/duplicate/);
 const result=importLessons(`2. Custom title | https://iframe.mediadelivery.net/embed/123/abc\n${raw}`);
 assert.equal(result[1].title,'Custom title');assert.equal(result[1].provider,'bunny_stream');
 assert.throws(()=>importLessons('not a URL'),/Line 1/);
});
test('HLS metadata sums fractional segment durations and does not count target duration',async()=>{
 const result=await inspectVideo({provider:'aws_cloudfront',videoUrl:`${host}/course/master.m3u8`},{readPlaylist:async()=> '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:5.5,\npart.ts\n#EXTINF:2.25,\nlast.ts\n#EXT-X-ENDLIST'});
 assert.equal(result.duration,7.75);
});
test('master playlist resolves nested variant using scoped grants',async()=>{
 let calls=0;
 const result=await inspectVideo({provider:'aws_cloudfront',videoUrl:`${host}/course/master.m3u8`},{readPlaylist:async grant=>{
 calls++;if(grant.url.endsWith('master.m3u8'))return cf.rewritePlaylist('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nlow.m3u8',grant);
 return '#EXTM3U\n#EXTINF:10,\na.ts\n#EXT-X-ENDLIST';}});
 assert.equal(result.duration,10);assert.equal(calls,2);
});
test('live, invalid durations and recursion fail with actionable messages',async()=>{
 const grant={url:`${host}/c/master.m3u8`};
 await assert.rejects(hlsDuration(grant,async()=> '#EXTM3U\n#EXTINF:5,\na.ts'),/live or unfinished/);
 await assert.rejects(hlsDuration(grant,async()=> '#EXTM3U\n#EXTINF:NaN,\na.ts\n#EXT-X-ENDLIST'),/invalid/);
 await assert.rejects(hlsDuration(grant,async()=>'',4),/nesting/);
});
test('Bunny metadata uses configured library credentials and returns duration only',async()=>{
 process.env.BUNNY_STREAM_LIBRARY_ID='123';process.env.BUNNY_STREAM_API_KEY='fixture-only';
 const result=await inspectVideo({videoUrl:'https://iframe.mediadelivery.net/embed/123/abc'}, {fetcher:async(url,options)=>{assert.equal(url,'https://video.bunnycdn.com/library/123/videos/abc');assert.equal(options.headers.AccessKey,'fixture-only');assert.equal(options.redirect,'error');return {ok:true,json:async()=>({length:42,title:'Provider title'})};}});
 assert.equal(result.duration,42);assert.equal(result.title,undefined);
 await assert.rejects(inspectVideo({videoUrl:'https://iframe.mediadelivery.net/embed/456/abc'}),/configured library/);
});
