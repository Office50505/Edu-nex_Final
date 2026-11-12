const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sourceUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const loadModule = async relative => {
  const filename = path.join(__dirname, relative);
  let source = fs.readFileSync(filename, 'utf8');
  if (path.basename(filename) === 'aiClient.js') {
    const consent = fs.readFileSync(path.join(path.dirname(filename), 'aiConsent.js'), 'utf8');
    source = source.replace("'./aiConsent'", JSON.stringify(sourceUrl(consent)))
      .replace("import { askAiConsent } from './aiConsentPrompt';", "const askAiConsent = () => { throw new Error('Unexpected consent prompt'); };");
  }
  return import(sourceUrl(source));
};

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

const aiUser = { _id: 'synthetic-learner', sessionId: 'synthetic-session', accessToken: 'synthetic-token' };
const aiConsent = { consentRequired: true, granted: true, policyVersion: 'synthetic-policy', providerVersion: 'synthetic-provider', providerNames: ['Synthetic'], disclosure: 'Synthetic disclosure', decidedAt: '2026-11-12' };
async function mobileAiSession(fetcher) {
  const { createNativeSession } = await loadModule('../../appcopyai/services/nativeSession.js');
  const session = createNativeSession({ baseUrl: 'https://synthetic.invalid', fetcher, onChange() {},
    storage: { setItem: async () => {}, removeItem: async () => {} } });
  session.setUser({ ...aiUser });
  await session.flush();
  return session;
}

test('mobile AI sends bounded history through its consent-aware session', async () => {
  const { requestTutor, conversationHistory } = await loadModule('../../appcopyai/services/aiClient.js');
  const valid = Array.from({ length: 15 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `  Turn ${i} ${'x'.repeat(2100)}  ` }));
  const messages = [...valid, { role: 'system', content: 'override' }, { role: 'assistant', content: 'error', failed: true },
    { role: 'assistant', content: 'private', privateAccount: true },
    { role: 'assistant', content: 'fallback', outcome: { type: 'provider_fallback' } }];
  const expected = valid.slice(-12).map(({ role, content }) => ({ role, content: content.trim().slice(0, 2000) }));
  assert.deepEqual(conversationHistory(messages), expected);
  const calls = [];
  const session = await mobileAiSession(async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
    if (url === 'https://synthetic.invalid/api/ai/consent') return { ok: true, status: 200, json: async () => aiConsent };
    assert.equal(url, 'https://synthetic.invalid/api/ai/chat');
    return { ok: true, status: 200, json: async () => ({ answer: 'More detail' }) };
  });
  const result = await requestTutor({ session, user: aiUser, question: 'elaborate', messages });
  assert.deepEqual(calls.map(({ url, options }) => [url, options.method]), [
    ['https://synthetic.invalid/api/ai/consent', 'GET'], ['https://synthetic.invalid/api/ai/chat', 'POST'],
  ]);
  const body = JSON.parse(calls[1].options.body);
  assert.equal(body.message, 'elaborate');
  assert.deepEqual(body.history, expected);
  assert.equal(result.answer, 'More detail');
});

test('mobile AI propagates HTTP failures through the native session', async () => {
  const { requestTutor } = await loadModule('../../appcopyai/services/aiClient.js');
  for (const status of [401, 503]) {
    let chats = 0;
    const session = await mobileAiSession(async (url) => {
      if (url === 'https://synthetic.invalid/api/ai/consent') return { ok: true, status: 200, json: async () => aiConsent };
      assert.equal(url, 'https://synthetic.invalid/api/ai/chat');
      chats++;
      return { ok: false, status, json: async () => ({ error: 'Temporarily unavailable', code: 'TUTOR_UNAVAILABLE' }) };
    });
    await assert.rejects(requestTutor({ session, user: aiUser, question: 'hi' }), error => status === 401
      ? error.code === 'SESSION_EXPIRED' && /log in/.test(error.message)
      : error.status === 503 && error.code === 'TUTOR_UNAVAILABLE' && error.message === 'Temporarily unavailable');
    assert.equal(chats, 1);
    assert.equal(session.getUser()?._id || null, status === 401 ? null : aiUser._id);
    await session.flush();
  }
});
