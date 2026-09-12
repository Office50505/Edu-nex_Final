const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const code=fs.readFileSync(require('node:path').join(__dirname,'../../appcopyai/downloadStorage.js'),'utf8').replaceAll('export ','');
const api=vm.runInNewContext(`${code}\n({downloadPath,prepareTemporaryDownloads})`);
function setup(saved,initial){
 const files=new Set(initial);let index=saved;
 const disk={cacheDirectory:'cache/',documentDirectory:'docs/',makeDirectoryAsync:async()=>{},getInfoAsync:async path=>({exists:files.has(path)}),moveAsync:async({from,to})=>{files.delete(from);files.add(to);},deleteAsync:async path=>{for(const file of files)if(file.startsWith(path))files.delete(file);}};
 return {disk,files,store:{getItem:async()=>JSON.stringify(index),setItem:async(_key,value)=>{index=JSON.parse(value);}}};
}
test('existing document videos move into cache and abandoned legacy partials are removed',async()=>{
 const h=setup({a:{status:'done',path:'docs/skillomate_dl/a.mp4'}},['docs/skillomate_dl/a.mp4','docs/skillomate_dl/partial.mp4']);
 const result=await api.prepareTemporaryDownloads(h.disk,h.store);
 assert.equal(result.a.path,'cache/skillomate_dl/a.mp4');assert.deepEqual([...h.files],['cache/skillomate_dl/a.mp4']);
});
test('evicted downloads and paths outside the private download directory are discarded',async()=>{
 const h=setup({a:{status:'done',path:'cache/skillomate_dl/a.mp4'},b:{status:'done',path:'docs/personal.mp4'}},['docs/personal.mp4']);
 assert.equal(Object.keys(await api.prepareTemporaryDownloads(h.disk,h.store)).length,0);assert.ok(h.files.has('docs/personal.mp4'));
});
test('missing cache and unsafe IDs never fall back to persistent storage',()=>{
 assert.throws(()=>api.downloadPath({documentDirectory:'docs/'},'a'),/Temporary/);
 assert.throws(()=>api.downloadPath({cacheDirectory:'cache/'},'../escape'),/Invalid/);
});
