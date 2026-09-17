const test = require('node:test');
const assert = require('node:assert/strict');
const { chatKey, readChat, updateChat } = require('../../appcopyai/courseAiCache');
test('lesson chat survives switching lessons and keeps late replies in their original lesson', () => {
  const a = chatKey('user', 'session', 'course', 'a');
  const b = chatKey('user', 'session', 'course', 'b');
  const entry = readChat(a);
  updateChat(a, entry, [{ role: 'user', content: 'Explain A' }], true);
  assert.deepEqual(readChat(b).messages, []);
  updateChat(a, entry, [...entry.messages, { role: 'assistant', content: 'Answer A' }], false);
  assert.equal(readChat(a).messages[1].content, 'Answer A');
  assert.equal(readChat(a).pending, false);
  assert.deepEqual(readChat(b).messages, []);
});
test('accounts, sessions and courses have separate conversations', () => {
  const key = chatKey('u', 's', 'c', 'v');
  const entry = readChat(key);
  updateChat(key, entry, [{ role: 'user', content: 'Private' }], false);
  for (const parts of [['other','s','c','v'], ['u','new','c','v'], ['u','s','other','v']]) {
    assert.deepEqual(readChat(chatKey(...parts)).messages, []);
  }
});
test('cache bounds messages and conversations, expires and ignores evicted replies', () => {
  const key = 'bounded';
  const entry = readChat(key);
  updateChat(key, entry, Array.from({ length: 60 }, (_, i) => ({ content: String(i) })), false);
  assert.equal(entry.messages.length, 40);
  for (let i = 0; i < 20; i++) readChat('eviction-' + i);
  assert.equal(updateChat(key, entry, [{ content: 'Late' }], false), false);
  const expiring = readChat('expiry', [], 0);
  assert.notEqual(readChat('expiry', [], 1800000), expiring);
});
