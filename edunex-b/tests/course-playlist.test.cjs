const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { playlistProjection, playlistPayload } = require('../services/coursePlaylist');
const id = '6aa4ecd63ddad7649031c35f';
const blob = 'A'.repeat(Math.round(2.24 * 1024 * 1024));
const course = { _id: id, title: 'Course', status: 'published', thumbnailHorizontal: { data: blob, mimeType: 'image/png' }, videos: Array.from({ length: 4 }, (_, index) => ({ _id: id, title: `Lesson ${index}`, provider: 'aws_cloudfront', videoUrl: 'https://private.example/video.m3u8', duration: 120, order: index, thumbnail: { data: blob, mimeType: 'image/png' } })) };
test('four lessons stay under 8 KB despite multi-megabyte embedded artwork', () => {
 const result = playlistPayload(course), json = JSON.stringify(result);
 assert.ok(Buffer.byteLength(json) < 8192); assert.equal(result.videos.length, 4);
 assert.equal(result.videos[0].playbackRequired, true);
 assert.equal(json.includes('private.example'), false); assert.equal(json.includes(blob.slice(0,100)), false);
 assert.equal(result.thumbnailUrl, `/api/courses/${id}/thumbnail`);
 assert.equal(result.videos[0].thumbnailUrl, `/api/courses/${id}/videos/${id}/thumbnail`);
});
test('projection excludes image blobs from the MongoDB response', () => {
 const fields = playlistProjection.split(' '); assert.ok(fields.includes('videos.thumbnail.mimeType'));
 for(const field of fields) assert.ok(!['videos','thumbnail','thumbnailHorizontal','thumbnailVertical','videos.thumbnail'].includes(field) && !field.endsWith('.data'));
});
test('uploaded URLs win and shared fallback retains provider metadata', () => {
 const result = playlistPayload({...course, thumbnailHorizontal:null, thumbnailUrl:'https://images.example/course.png', videos:[{_id:id,provider:'youtube',youtubeId:'youtube123',thumbnailUrl:'https://images.example/lesson.png',notesUrl:'https://notes.example/lesson-one'},{_id:id,provider:'bunny_stream',bunnyVideoId:'bunny-id',bunnyLibraryId:'library'}]});
 assert.equal(result.videos[0].thumbnailUrl,'https://images.example/lesson.png'); assert.equal(result.videos[0].youtubeId,'youtube123');
 assert.equal(result.videos[0].notesUrl,'https://notes.example/lesson-one');
 assert.equal(result.videos[1].thumbnailUrl,'https://images.example/course.png'); assert.equal(result.videos[1].bunnyVideoId,'bunny-id');
});
function setup(record) {
 const routes=[]; let query;
 const context={module:{exports:{}},process,URL,Buffer,require(name){
  if(name==='express')return {Router:()=>Object.fromEntries(['get','post','patch','delete','put'].map(method=>[method,(...args)=>routes.push(args)]))};
  if(name==='mongoose')return {Types:{ObjectId:{isValid:id=>/^[a-f0-9]{24}$/.test(id)}}};
  if(name.endsWith('/Course'))return {findOne(filter){query=filter;return {select:()=>({lean:async()=>record})};}};
  if(name.endsWith('/coursePlaylist'))return {playlistProjection,playlistPayload}; return {};
 }};
 vm.runInNewContext(fs.readFileSync(require.resolve('../routes/content'),'utf8'),context);
 return {handler:routes.find(r=>Array.isArray(r[0]))[1],query:()=>query};
}
const response=()=>({code:200,headers:{},status(n){this.code=n;return this;},set(k,v){this.headers[k]=v;return this;},type(v){this.mime=v;return this;},send(v){this.body=v;return this;},end(){return this;},json(v){this.body=v;return this;},redirect(v){this.url=v;return this;}});
test('artwork endpoint only queries published courses and caches image responses',async()=>{
 const {handler,query}=setup({thumbnailHorizontal:{data:Buffer.from('picture').toString('base64'),mimeType:'image/png'}});
 const res=response();await handler({params:{id},query:{}},res);
 assert.equal(query().status,'published');assert.equal(res.body.toString(),'picture');assert.equal(res.mime,'image/png');assert.equal(res.headers['Cache-Control'],'public, max-age=300');
});
test('missing course/artwork and invalid IDs fail cleanly',async()=>{
 const {handler}=setup(null);const missing=response();await handler({params:{id},query:{}},missing);assert.equal(missing.code,404);
 const bad=response();await handler({params:{id:'bad'},query:{}},bad);assert.equal(bad.code,400);
});

test('embedded course upload takes precedence over an older URL',()=>{
 const result=playlistPayload({...course,thumbnailUrl:'https://images.example/old.png'});
 assert.equal(result.thumbnailUrl,`/api/courses/${id}/thumbnail`);
});
