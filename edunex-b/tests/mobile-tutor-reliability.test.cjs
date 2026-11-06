const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
async function client() {
  const core = fs.readFileSync(path.join(__dirname, '../../appcopyai/services/aiConsent.js'), 'utf8');
  const coreUrl = 'data:text/javascript;base64,' + Buffer.from(core).toString('base64');
  const source = fs.readFileSync(path.join(__dirname, '../../appcopyai/services/aiClient.js'), 'utf8')
    .replace("'./aiConsent'", JSON.stringify(coreUrl))
    .replace("import { askAiConsent } from './aiConsentPrompt';", "const askAiConsent = () => { throw new Error('Unexpected prompt'); };");
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}
const user = { _id: 'synthetic', sessionId: 'session' };
const consent = { consentRequired: true, granted: true, policyVersion: 'current', providerVersion: 'provider', providerNames: ['Synthetic'], disclosure: 'Synthetic', decidedAt: 'date' };
test('native transport sends course, conversation, prior answer and changed task without failed responses', async () => {
  const { requestTutor } = await client(); let sent;
  const data = await requestTutor({ user, activeCourseId: 'local-course', lessonId: 'lesson-2', conversationId: 'same-chat', question: 'Now change the name.',
    messages: [{ role: 'user', content: 'My repair shop is Copper Wheel.' }, { role: 'assistant', content: 'Use the real photo.' },
      { role: 'assistant', content: 'Course overview', outcome: { type: 'provider_fallback' } }, { role: 'assistant', content: 'Unavailable', failed: true }],
    session: { getUser: () => user, requestJson: async (url, options) => { if (url === '/api/ai/consent') return consent; assert.equal(url, '/api/ai/chat'); sent = JSON.parse(options.body);
      return { answer: 'Use Copper Cycle.', messageId: 'reply', provider: 'fal-openrouter', outcome: { type: 'live_model' } }; } } });
  assert.equal(sent.activeCourseId, 'local-course'); assert.equal(sent.conversationId, 'same-chat');
  assert.equal(sent.lessonId, 'lesson-2');
  assert.equal(sent.history.length, 2); assert.equal(data.provider, 'fal-openrouter'); assert.equal(data.outcome.type, 'live_model');
});
test('native transport rejects legacy fallback and structured unavailability', async () => {
  const { requestTutor } = await client();
  for (const data of [{ answer: 'Course summary', provider: 'built-in-course-guide' }, { outcome: { type: 'unavailable' } }, { answer: 'Summary', outcome: { type: 'provider_fallback' } }]) {
    await assert.rejects(requestTutor({ user, question: 'Write a caption.', messages: [], session: { getUser: () => user, requestJson: async url => url === '/api/ai/consent' ? consent : data } }), e => e.code === 'TUTOR_UNAVAILABLE');
  }
});
test('native failure retains useful public error and diagnostic code', async () => {
  const { requestTutor } = await client();
  await assert.rejects(requestTutor({ user, question: 'Help', messages: [], session: {
    getUser: () => user, requestJson: async url => {
      if (url === '/api/ai/consent') return consent;
      throw Object.assign(new Error('Nex AI is temporarily unavailable.'), { status: 503, code: 'TUTOR_UNAVAILABLE', outcome: { providerStatus: 'not_configured' } });
    },
  } }), e => e.status === 503 && e.code === 'TUTOR_UNAVAILABLE' && e.outcome.providerStatus === 'not_configured');
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
