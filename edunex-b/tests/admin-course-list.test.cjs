const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../server.js'), 'utf8');
const route = source.slice(source.indexOf("app.get('/api/admin/courses',"), source.indexOf("app.patch('/api/admin/courses/:id'"));
async function request(summary) {
  let handler, projection, payload;
  const query = {select(value){projection=value;return this;},populate(){return this;},sort(){return this;},async lean(){return [{_id:'c',title:'Course',videos:[{_id:'a'},{_id:'b'}]}];}};
  const guard = () => {};
  vm.runInNewContext(route, {app:{get(path,auth,fn){assert.equal(auth,guard);handler=fn;}},protectAdmin:guard,Course:{find:()=>query}});
  await handler({query:{summary}}, {json(value){payload=value;},status(){throw Error('Unexpected error');}});
  return {projection,payload};
}
test('admin summary excludes embedded artwork and retains lesson counts', async()=>{
  const {projection,payload}=await request('1');
  const fields=projection.split(' ');
  assert.ok(fields.includes('videos._id'));
  for(const field of ['thumbnail','thumbnailHorizontal','thumbnailVertical','videos']) assert.ok(!fields.includes(field));
  assert.equal(payload[0].videoCount,2);
  assert.equal(payload[0].title,'Course');
});
test('editor requests retain their existing full-document query',async()=>{
  assert.equal((await request(undefined)).projection,undefined);
});
