const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const code=fs.readFileSync(require('node:path').join(__dirname,'../../appcopyai/downloadStorage.js'),'utf8').replaceAll('export ','');
const api=vm.runInNewContext(`${code}\n({downloadPath,normalizeLocalHlsManifest,prepareTemporaryDownloads,validateHlsDownloadBundle})`);
function setup(saved,initial){
 const files=new Set(initial);let index=saved;const contents=new Map();
 const disk={cacheDirectory:'cache/',documentDirectory:'docs/',makeDirectoryAsync:async()=>{},getInfoAsync:async path=>({exists:files.has(path)}),moveAsync:async({from,to})=>{files.delete(from);files.add(to);},deleteAsync:async path=>{for(const file of files)if(file.startsWith(path))files.delete(file);},readAsStringAsync:async path=>contents.get(path)||'',writeAsStringAsync:async(path,value)=>{contents.set(path,value);files.add(path);}};
 return {disk,files,contents,store:{getItem:async()=>JSON.stringify(index),setItem:async(_key,value)=>{index=JSON.parse(value);}}};
}
test('existing document videos move into cache and abandoned legacy partials are removed',async()=>{
 const h=setup({a:{status:'done',path:'docs/skillomate_dl/a.mp4'}},['docs/skillomate_dl/a.mp4','docs/skillomate_dl/partial.mp4']);
 const result=await api.prepareTemporaryDownloads(h.disk,h.store);
 assert.equal(result.a.path,'cache/skillomate_dl/a/video.mp4');assert.deepEqual([...h.files],['cache/skillomate_dl/a/video.mp4']);
});
test('evicted downloads and paths outside the private download directory are discarded',async()=>{
 const h=setup({a:{status:'done',path:'cache/skillomate_dl/a.mp4'},b:{status:'done',path:'docs/personal.mp4'}},['docs/personal.mp4']);
 assert.equal(Object.keys(await api.prepareTemporaryDownloads(h.disk,h.store)).length,0);assert.ok(h.files.has('docs/personal.mp4'));
});
test('hls downloads are kept only when every local resource exists',async()=>{
 const saved={a:{status:'done',kind:'hls',provider:'bunny_stream',offlineFormatVersion:2,path:'file://cache/skillomate_dl/a/index.m3u8'}};
 const text='#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:4,\npart-0001.ts\n#EXT-X-ENDLIST';
 const h=setup(saved,['file://cache/skillomate_dl/a/index.m3u8','file://cache/skillomate_dl/a/key.bin','file://cache/skillomate_dl/a/part-0001.ts']);
 h.disk.cacheDirectory='file://cache/';
 h.contents.set('file://cache/skillomate_dl/a/index.m3u8',text);
 h.disk.getInfoAsync=async path=>{
  const localPath=String(path).replace(/^file:\/\//,'');
  return {exists:h.files.has(path)||h.files.has(localPath),size:path.endsWith('.m3u8')?90:2048};
 };
 const result=await api.prepareTemporaryDownloads(h.disk,h.store);
 assert.equal(result.a.size,4186);
 assert.match(h.contents.get('file://cache/skillomate_dl/a/index.m3u8'),/file:\/\/cache\/skillomate_dl\/a\/part-0001\.ts/);
 h.files.delete('file://cache/skillomate_dl/a/part-0001.ts');
 assert.equal(Object.keys(await api.prepareTemporaryDownloads(h.disk,h.store)).length,0);
});
test('missing cache and unsafe IDs never fall back to persistent storage',()=>{
 assert.throws(()=>api.downloadPath({documentDirectory:'docs/'},'a'),/Temporary/);
 assert.throws(()=>api.downloadPath({cacheDirectory:'cache/'},''),/Invalid/);
});
