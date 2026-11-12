require('./helpers/deny-network.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { backend } = require('./ai-tutor-fixture.cjs');

const courseId = '6e0000000000000000000011';
const scope = { courseId, conversationId: 'outage-context' };
const declaration = 'My item is a hollow ebony whistle tray. Price: 915. Material: wood.';
const replacement = 'Replace the product with a soft felt marimba cover.';
const template = 'Copy the complete L02 White Studio template for the same product.';
function fixture(options = {}) {
  const sessions = options.sessions || new Map();
  const api = backend({
    sessions, noKey: true,
    courses: [{ _id: courseId, slug: 'ai-product-photoshoot-ads', title: 'AI Product Photoshoot & Ads', videos: [] }],
    user: { _id: 'outage-learner' },
    subscription: { status: 'active', currentPeriodEnd: new Date(Date.now() + 60000) },
    ...options,
  });
  return { api, sessions };
}

for (const [name, options] of [['missing provider key', {}], ['provider transport failure', { noKey: false, fail: true }]]) {
  test(`product declarations and replacement survive ${name}`, async () => {
    const { api, sessions } = fixture(options);
    for (const message of [declaration, replacement]) {
      const response = await api.rawChat({ ...scope, message });
      assert.equal(response.statusCode, 503);
      assert.equal(response.result.provider, 'unavailable');
      assert.equal(sessions.size, 1);
      assert.ok([...sessions.values()][0].messages.every(turn => turn.role === 'user'));
    }
    const state = [...sessions.values()][0];
    assert.equal(state.productContext.product, 'soft felt marimba cover');
    assert.equal(state.productContext.price, undefined);
    assert.equal(state.productContext.attributes.length, 0);
    assert.equal(state.messages.length, 2);
    const response = await api.rawChat({ ...scope, message: template });
    assert.equal(response.statusCode, 200);
    assert.match(response.result.reply, /soft felt marimba cover/);
    assert.doesNotMatch(response.result.reply, /\[PRODUCT\]|hollow ebony|915/i);
    assert.equal([...sessions.values()][0].messages.at(-1).role, 'assistant');
  });
}

test('outage context cannot cross conversations, accounts, or courses', async () => {
  const { api, sessions } = fixture();
  await api.rawChat({ ...scope, message: declaration });
  const otherAccount = fixture({ sessions, userId: 'other-learner', user: { _id: 'other-learner' } }).api;
  for (const [client, request] of [
    [otherAccount, scope],
    [api, { ...scope, conversationId: 'another-conversation' }],
    [api, { ...scope, courseId: '6e0000000000000000000022' }],
  ]) {
    const response = await client.rawChat({ ...request, message: template });
    assert.doesNotMatch(JSON.stringify(response.result), /hollow ebony|915/);
  }
});

test('does not persist outage context when consent cannot be revalidated', async () => {
  const { api, sessions } = fixture({ noKey: false, fail: true,
    providerHook: () => api.consent.setUnavailable(true) });
  await api.rawChat({ ...scope, message: declaration });
  assert.equal(sessions.size, 0);
});

for (const [name, options, authenticated] of [
  ['missing consent', { consent: 'missing' }, true],
  ['expired access', { subscription: { status: 'expired', currentPeriodEnd: new Date(0) } }, true],
  ['failed context loading', { contextError: new Error('Context unavailable') }, true],
  ['unauthenticated request', {}, false],
]) {
  test(`does not save product outage context for ${name}`, async () => {
    const { api, sessions } = fixture(options);
    await api.request('POST', '/chat', { ...scope, message: declaration }, authenticated);
    assert.equal(sessions.size, 0);
  });
}
