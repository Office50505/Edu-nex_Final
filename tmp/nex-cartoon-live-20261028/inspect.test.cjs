require('../../edunex-b/tests/helpers/deny-network.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { exchanges } = require('./inspect.cjs');
test('inspection pairs initial and repair responses with their delivered answer across conversations', () => {
  const rows = exchanges([
    { type: 'provider_response', request_id: 'one', call: 1, data: { choices: [{ message: { content: 'Initial unsupported draft' } }] } },
    { type: 'provider_response', request_id: 'two', call: 2, data: { choices: [{ message: { content: 'Other conversation' } }] } },
    { type: 'provider_response', request_id: 'one', call: 3, data: { choices: [{ message: { content: 'Repaired draft' } }] } },
    { type: 'task_assessment', request_id: 'one', assessment: { needsRepair: false } },
    { type: 'chat_response', request_id: 'one', conversation_id: 'chat-a', request: { message: 'Poster request' }, response: { answer: 'Final safe poster' }, httpStatus: 200 },
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].rawProviderResponses.map(item => item.attempt), [1, 3]);
  assert.equal(rows[0].delivered.text, 'Final safe poster');
  assert.equal(rows[0].question, 'Poster request');
  assert.equal(rows[0].assessments[0].needsRepair, false);
  assert.equal(rows[1].delivered, null);
});
test('inspection distinguishes blocked or failed attempts from actual model answers', () => {
  const rows = exchanges([{ type: 'provider_blocked', request_id: 'blocked', reason: 'manual_qa_awaiting_approval' },
    { type: 'provider_transport_error', request_id: 'failed', call: 1, name: 'AbortError' }]);
  assert.equal(rows[0].rawProviderResponses[0].attempt, null);
  assert.equal(rows[1].rawProviderResponses[0].attempt, 1);
});
