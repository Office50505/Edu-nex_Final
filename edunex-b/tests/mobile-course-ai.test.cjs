const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../routes/mobileCompat'), 'utf8');
function setup() {
  let handler, forwarded;
  const start = source.indexOf("router.post(\n  '/course-ai/chat'");
  const end = source.indexOf("\nrouter.get(", start);
  vm.runInNewContext(source.slice(start, end), {
    router: { post(_path, _auth, fn) { handler = fn; } },
    requireCompatibleAuth: () => () => {}, asyncHandler: fn => fn,
    requireSameUser(req, id) { if (id !== req.compatUser._id) throw new Error('Forbidden'); },
    handleTutorChat(req) { forwarded = req.body; return { answer: 'Tutor answer' }; },
  });
  return { handler, get forwarded() { return forwarded; } };
}
test('legacy mobile chat uses integrated tutor with course and conversation history', async () => {
  const api = setup();
  const messages = [{ role: 'user', content: 'Earlier question' }];
  const result = await api.handler({ compatUser: { _id: 'u1' }, body: { userId: 'u1', question: 'Explain', courseId: 'c1', messages } }, {});
  assert.equal(result.answer, 'Tutor answer');
  assert.equal(api.forwarded.message, 'Explain');
  assert.equal(api.forwarded.courseId, 'c1');
  assert.deepEqual(api.forwarded.history, messages);
});
test('legacy route rejects another user and malformed questions', async () => {
  const api = setup();
  await assert.rejects(api.handler({ compatUser: { _id: 'u1' }, body: { userId: 'u2', question: 'Explain' } }, {}), /Forbidden/);
  let status;
  await api.handler({ body: { userId: 'u1', question: {} } }, { status(code) { status = code; return this; }, json() {} });
  assert.equal(status, 400);
  assert.equal(api.forwarded, undefined);
});
