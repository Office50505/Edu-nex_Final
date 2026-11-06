const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');
const source = fs.readFileSync(require.resolve('../App.js'), 'utf8');
const ast = babel.parseSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } });
const pick = name => { const n = ast.program.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === name); return source.slice(n.start, n.end); };
function fixture(status, body) {
  const c = { API_BASE: 'https://api.test', AbortController, setTimeout, clearTimeout,
    fetch: async () => ({ ok: status < 400, status, text: async () => body }) };
  vm.createContext(c); vm.runInContext(pick('readJsonResponse') + '\n' + pick('fetchApiJson'), c);
  return c;
}
for (const status of [404, 502, 503]) test(`HTTP ${status} HTML error does not leak server markup or internal routes`, async () => {
  const c = fixture(status, '<!DOCTYPE html><pre>Cannot GET /api/public/courses/private-id/videos</pre>');
  await assert.rejects(c.fetchApiJson('/api/public/courses/course/videos'), error => {
    assert.match(error.message, /temporarily unavailable/);
    assert.doesNotMatch(error.message, /<|Cannot GET|\/api\/|private-id/);
    return true;
  });
});
test('a successful non-JSON response is a retryable error, not an empty lesson list', async () => {
  const c = fixture(200, '<html>maintenance</html>');
  await assert.rejects(c.fetchApiJson('/api/public/courses/course/videos'), /unexpected response/);
});
test('JSON lessons and meaningful JSON server errors retain their existing behavior', async () => {
  const c = fixture(200, JSON.stringify({ videos: [{ _id: 'intro' }] }));
  assert.equal((await c.fetchApiJson('/api/public/courses/course/videos')).videos[0]._id, 'intro');
  const denied = fixture(403, JSON.stringify({ error: 'A purchase is required for this lesson.' }));
  await assert.rejects(denied.fetchApiJson('/api/test'), /purchase is required/);
});
