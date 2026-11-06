const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
async function client() {
  const source = fs.readFileSync(path.join(__dirname, '../../appcopyai/services/aiClient.js'), 'utf8');
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}
const user = { _id: 'synthetic', sessionId: 'session' };
test('native transport sends course, conversation, prior answer and changed task without failed responses', async () => {
  const { requestTutor } = await client(); let sent;
  const data = await requestTutor({ user, activeCourseId: 'local-course', lessonId: 'lesson-2', conversationId: 'same-chat', question: 'Now change the name.',
    messages: [{ role: 'user', content: 'My repair shop is Copper Wheel.' }, { role: 'assistant', content: 'Use the real photo.' },
      { role: 'assistant', content: 'Course overview', outcome: { type: 'provider_fallback' } }, { role: 'assistant', content: 'Unavailable', failed: true }],
    session: { getUser: () => user, requestJson: async (url, options) => { assert.equal(url, '/api/ai/chat'); sent = JSON.parse(options.body);
      return { answer: 'Use Copper Cycle.', messageId: 'reply', provider: 'fal-openrouter', outcome: { type: 'live_model' } }; } } });
  assert.equal(sent.activeCourseId, 'local-course'); assert.equal(sent.conversationId, 'same-chat');
  assert.equal(sent.lessonId, 'lesson-2');
  assert.equal(sent.history.length, 2); assert.equal(data.provider, 'fal-openrouter'); assert.equal(data.outcome.type, 'live_model');
});
test('native transport rejects legacy fallback and structured unavailability', async () => {
  const { requestTutor } = await client();
  for (const data of [{ answer: 'Course summary', provider: 'built-in-course-guide' }, { outcome: { type: 'unavailable' } }, { answer: 'Summary', outcome: { type: 'provider_fallback' } }]) {
    await assert.rejects(requestTutor({ user, question: 'Write a caption.', messages: [], session: { getUser: () => user, requestJson: async () => data } }), e => e.code === 'TUTOR_UNAVAILABLE');
  }
});
test('native HTTP failure retains useful public error and diagnostic code', async () => {
  const { requestTutor } = await client();
  await assert.rejects(requestTutor({ baseUrl: 'http://local.invalid', user, question: 'Help', messages: [],
    fetcher: async () => ({ ok: false, status: 503, json: async () => ({ error: 'Nex AI is temporarily unavailable.', code: 'TUTOR_UNAVAILABLE', outcome: { providerStatus: 'not_configured' } }) }) }),
  e => e.status === 503 && e.code === 'TUTOR_UNAVAILABLE' && e.outcome.providerStatus === 'not_configured');
});
test('course selection separates stored master conversations and account boundaries', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../appcopyai/App.js'), 'utf8');
  const helpers = source.slice(source.indexOf('function aiChatOwner('), source.indexOf('function newAiChatId('));
  const context = { AI_CHAT_STORAGE_PREFIX: 'test' }; vm.createContext(context); vm.runInContext(helpers, context);
  const a = context.aiChatStorageKey(user, 'master', null, { _id: 'course-a' });
  assert.notEqual(a, context.aiChatStorageKey(user, 'master', null, { _id: 'course-b' }));
  assert.notEqual(a, context.aiChatStorageKey({ _id: 'other' }, 'master', null, { _id: 'course-a' }));
  assert.notEqual(a, context.aiChatStorageKey(user, 'master', null, null));
});
