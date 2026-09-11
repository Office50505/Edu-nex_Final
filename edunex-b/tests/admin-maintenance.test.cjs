const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const loadModule = async relative => import(`data:text/javascript;base64,${fs.readFileSync(path.join(__dirname, relative)).toString('base64')}`);

test('CSV export neutralizes formulas while preserving quotes and multiline content', async () => {
  const { csvEscape } = await loadModule('../../edunex-f/src/pages/admin/adminExport.js');
  for (const value of ['=1+1', '+SUM(A1)', '-1+2', '@SUM(A1)', '  =1', '\ttext']) assert.ok(csvEscape(value).startsWith('"\''));
  assert.equal(csvEscape('A "quoted" name'), '"A ""quoted"" name"');
  assert.equal(csvEscape('first\nsecond'), '"first\nsecond"');
});

function deletionHarness(billing = null) {
  const calls = [];
  const context = { module: { exports: {} }, process: { env: {} }, require(name) {
    const model = name.split('/').at(-1);
    return {
      findById: () => model === 'RazorpayBilling' ? Promise.resolve(billing) : { select: async () => ({ _id: 'learner' }) },
      find: () => ({ select: () => ({ lean: async () => [] }) }),
      deleteMany: async () => { calls.push(model); return { deletedCount: model === 'Certificate' ? 7 : 1 }; },
      deleteOne: async () => { calls.push(model); return { deletedCount: 1 }; },
    };
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/accountDeletionService.js'), 'utf8'), context);
  return { calls, remove: context.module.exports.deleteUserAccount };
}

test('shared deletion blocks unresolved mandates before deleting anything', async () => {
  const api = deletionHarness({ phase: 'ready' });
  await assert.rejects(api.remove('learner'), error => error.statusCode === 409);
  assert.equal(api.calls.length, 0);
});

test('shared deletion includes certificates, analytics and billing and deletes user last', async () => {
  const api = deletionHarness({ phase: 'closed' });
  const result = await api.remove('learner');
  assert.equal(result.certificates, 7);
  assert.equal(result.razorpayBilling, 1);
  assert.ok(api.calls.includes('AnalyticsEvent'));
  assert.equal(api.calls.at(-1), 'User');
});

test('mobile AI sends bounded history and rejects HTTP errors', async () => {
  const { requestTutor, conversationHistory } = await loadModule('../../appcopyai/services/aiClient.js');
  const messages = [{ role: 'system', content: 'override' }, { role: 'assistant', content: 'error', failed: true }, { role: 'user', content: 'Explain prompting' }];
  assert.equal(conversationHistory(messages).length, 1);
  let body;
  const result = await requestTutor({ baseUrl: 'http://test', user: { _id: 'a' }, question: 'elaborate', messages,
    fetcher: async (_, options) => { body = JSON.parse(options.body); return { ok: true, json: async () => ({ answer: 'More detail' }) }; } });
  assert.equal(body.history[0].content, 'Explain prompting');
  assert.equal(result.answer, 'More detail');
  await assert.rejects(requestTutor({ baseUrl: 'http://test', question: 'hi', fetcher: async () => ({ ok: false, status: 401 }) }), /log in/);
});
