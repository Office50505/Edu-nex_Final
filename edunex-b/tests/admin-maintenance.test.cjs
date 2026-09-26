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

function deletionHarness(billing = null, options = {}) {
  const calls = [];
  const created = [];
  const context = { module: { exports: {} }, process: { env: { ACCOUNT_DELETION_HASH_SECRET: 'test-secret' } }, require(name) {
    if (name === 'node:crypto') return require('node:crypto');
    if (name === './cancelAccountBilling') return {cancelAccountBilling: async (value, subscriptions) => {
      if (options.cancellationError) throw options.cancellationError;
      if (value?.phase === 'ready') throw new Error('Payment setup is still being confirmed.');
      if (subscriptions?.some(item => item.phonePeMandateId === 'legacy-phonepe')) throw Object.assign(new Error('PhonePe cancellation unavailable'), { code: 'PHONEPE_MANUAL_CANCELLATION_REQUIRED' });
      calls.push('billingCancelled');
    }};
    const model = name.split('/').at(-1);
    return {
      findById: () => model === 'RazorpayBilling' ? Promise.resolve(billing) : { select: async () => options.userExists === false ? null : ({ _id: 'learner' }) },
      find: () => ({ select: () => ({ lean: async () => options.subscriptions || [] }) }),
      create: async value => { calls.push(model); created.push({ model, value }); return value; },
      updateOne: async () => { calls.push(model); return { modifiedCount: 1 }; },
      updateMany: async () => { calls.push(model); return { modifiedCount: 1 }; },
      deleteMany: async () => { calls.push(model); return { deletedCount: model === 'Certificate' ? 7 : 1 }; },
      deleteOne: async () => { calls.push(model); return { deletedCount: 1 }; },
    };
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/accountDeletionService.js'), 'utf8'), context);
  return { calls, created, remove: context.module.exports.deleteUserAccount };
}

test('shared deletion revokes access, completes deletion and queues unresolved billing cancellation', async () => {
  const api = deletionHarness({ phase: 'ready' });
  const result = await api.remove('learner');
  assert.equal(result.billingCancellationQueued, true);
  assert.ok(api.calls.includes('BillingCancellationJob'));
  assert.equal(api.calls.at(-1), 'User');
});

test('shared deletion includes certificates, analytics and billing and deletes user last', async () => {
  const api = deletionHarness({ phase: 'closed' });
  const result = await api.remove('learner');
  assert.ok(api.calls.includes('billingCancelled'));
  assert.equal(result.certificates, 7);
  assert.equal(result.razorpayBilling, 1);
  assert.equal(result.onboardingSessions, 1);
  assert.ok(api.calls.includes('OnboardingSession'));
  assert.ok(api.calls.includes('AnalyticsEvent'));
  assert.equal(api.calls.at(-1), 'User');
});

test('provider timeout and legacy PhonePe failure queue cancellation without blocking deletion', async () => {
  for (const options of [
    { cancellationError: Object.assign(new Error('provider timed out'), { code: 'ETIMEDOUT' }) },
    { subscriptions: [{ _id: 'sub-1', phonePeMandateId: 'legacy-phonepe', gateway: 'phonepe' }] },
  ]) {
    const api = deletionHarness(null, options);
    const result = await api.remove('learner');
    assert.equal(result.billingCancellationQueued, true);
    assert.equal(api.calls.at(-1), 'User');
    const job = api.created.find(item => item.model === 'BillingCancellationJob')?.value;
    assert.equal(job.status, 'pending');
    assert.equal(job.attempts, 1);
  }
});

test('deletion works without billing and repeated requests are idempotent', async () => {
  const normal = deletionHarness();
  const result = await normal.remove('learner');
  assert.equal(result.billingCancellationQueued, false);
  assert.equal(normal.calls.at(-1), 'User');

  const repeated = deletionHarness(null, { userExists: false });
  assert.equal((await repeated.remove('learner')).alreadyDeleted, true);
  assert.equal(repeated.calls.length, 0);
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
