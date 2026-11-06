const test = require('node:test');
const assert = require('node:assert/strict');
const { backend } = require('./ai-tutor-fixture.cjs');
const { requestTutorProvider } = require('../services/tutorProvider');

async function decide(api, granted, overrides = {}) {
  const { result: state } = await api.request('GET', '/consent');
  return api.request('PUT', '/consent', { granted, policyVersion: state.policyVersion, providerVersion: state.providerVersion, ...overrides });
}
test('first use defaults off; explicit current acceptance persists and allows chat', async () => {
  const api = backend({ consent: 'absent' });
  const before = await api.request('GET', '/consent');
  assert.equal(before.result.granted, false);
  assert.equal(before.result.consentRequired, true);
  assert.equal(before.headers['cache-control'], 'no-store');
  assert.match(before.result.disclosure, /fal.ai.*OpenRouter.*Google Gemini/s);
  assert.match(before.result.disclosure, /does not automatically attach.*age.*gender.*payment records/s);
  assert.match(before.result.disclosure, /Personal information you type/);
  assert.equal((await api.rawChat({ message: 'Explain prompting' })).statusCode, 403);
  assert.equal(api.calls.length, 0);
  const accepted = await decide(api, true);
  assert.equal(accepted.result.granted, true);
  assert.ok(accepted.result.decidedAt);
  assert.equal(api.consent.writes.length, 1);
  assert.equal((await api.rawChat({ message: 'Explain prompting' })).statusCode, 200);
  assert.equal(api.calls.length, 1);
});
test('decline and withdrawal are recorded and block old and new clients', async () => {
  const api = backend({ consent: 'absent' });
  assert.equal((await decide(api, false)).result.granted, false);
  assert.equal((await api.rawChat({ message: 'Explain prompting' })).statusCode, 403);
  await decide(api, true);
  const withdrawn = await api.request('PUT', '/consent', { granted: false, policyVersion: 'old' });
  assert.equal(withdrawn.result.granted, false);
  assert.equal((await api.rawChat({ message: 'Explain prompting', consentGranted: true })).statusCode, 403);
  assert.equal(api.calls.length, 0);
  // History deletion and reporting remain available after withdrawal.
  assert.equal((await api.request('DELETE', '/history')).statusCode, 200);
  assert.equal((await api.request('POST', '/reports', { messageId: 'synthetic', reason: 'privacy_concern' })).statusCode, 201);
});
test('obsolete policy, provider, missing versions or non-boolean decisions cannot grant', async () => {
  for (const override of [{ policyVersion: 'old' }, { providerVersion: 'old' }, { policyVersion: undefined }, { granted: 'true' }]) {
    const api = backend({ consent: 'absent' });
    const response = await decide(api, true, override);
    assert.ok([400,409].includes(response.statusCode));
    assert.equal(api.consent.writes.length, 0);
    assert.equal((await api.rawChat({ message: 'Explain prompting' })).statusCode, 403);
  }
});
test('unavailable consent storage fails closed without any provider call', async () => {
  const api = backend(); api.consent.setUnavailable(true);
  assert.equal((await api.request('GET', '/consent')).statusCode, 503);
  assert.equal((await api.rawChat({ message: 'Explain prompting' })).statusCode, 503);
  assert.equal(api.calls.length, 0);
});
test('shared chat handler used by the legacy course endpoint also enforces consent', async () => {
  const api = backend({ consent: 'absent' }); let status, data;
  const res = { status(n) { status=n;return this; }, json(value) { data=value; } };
  await api.handleTutorChat({ compatAuth: { userId: 'learner' }, body: { message: 'Explain prompting' } }, res);
  assert.equal(status,403); assert.equal(data.code,'AI_CONSENT_REQUIRED'); assert.equal(api.calls.length,0);
});
test('withdrawing during a failed attempt stops a scheduled external retry', async () => {
  const api = backend(); let calls=0;
  await assert.rejects(requestTutorProvider({ url: 'https://synthetic.invalid', key: 'synthetic', payload: {}, extractText: () => 'ok',
    beforeRequest: () => api.consent.service.requireAiConsent('learner'), sleep: async () => {},
    fetchImpl: async () => { calls++; await decide(api,false); return { ok:false,status:503 }; },
  }), e => e.code === 'AI_CONSENT_REQUIRED');
  assert.equal(calls,1);
});
