const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = name => import('data:text/javascript;base64,' + fs.readFileSync(path.join(__dirname, '../../appcopyai/services', name)).toString('base64'));
const initial = { _id: 'u1', sessionId: 's1', accessToken: 'expired', token: 'expired', refreshToken: 'r1', avatar: 'old' };
const rotated = { _id: 'u1', sessionId: 's1', accessToken: 'fresh', refreshToken: 'r2' };
const reply = (status, data = {}) => ({ ok: status < 400, status, json: async () => data });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
async function setup(fetcher, options = {}) {
  const { createNativeSession } = await load('nativeSession.js');
  let saved, ended = 0;
  const storage = { getItem: async () => saved, setItem: async (_key, value) => { saved = value; }, removeItem: async () => { saved = null; } };
  const session = createNativeSession({ baseUrl: 'https://example.test', storage, onChange() {}, onExpired() { ended++; }, fetcher, ...options });
  session.setUser({ ...initial }); await session.flush();
  return { session, storage, saved: () => saved && JSON.parse(saved), ended: () => ended };
}
test('expired tutor token refreshes, rotates both tokens and retries exactly once with identical history', async () => {
  const calls = [];
  const h = await setup(async (url, options) => {
    calls.push({ url, ...options });
    return url.endsWith('/refresh') ? reply(200, rotated) : options.headers.Authorization === 'Bearer expired' ? reply(401) : reply(200, { reply: 'Answer' });
  });
  const { requestTutor } = await load('aiClient.js');
  const result = await requestTutor({ baseUrl: 'https://example.test', user: initial, session: h.session, question: 'Explain', courseId: 'course', assistantName: 'Nex', messages: [{ role: 'user', content: 'Earlier' }] });
  assert.equal(result.answer, 'Answer'); assert.equal(calls.length, 3);
  assert.equal(calls[0].body, calls[2].body);
  assert.equal(calls[2].headers.Authorization, 'Bearer fresh');
  assert.equal(h.saved().refreshToken, 'r2'); assert.equal(h.saved().token, 'fresh');
  const { createNativeSession } = await load('nativeSession.js');
  const restored = createNativeSession({ baseUrl: '', storage: h.storage, onChange() {} });
  await restored.restore(); assert.equal(restored.getUser().accessToken, 'fresh');
});
test('concurrent 401 responses share one refresh; profile updates preserve rotated credentials', async () => {
  const pending = deferred(); let refreshes = 0;
  const h = await setup(async (url, options) => {
    if (url.endsWith('/refresh')) { refreshes++; return pending.promise; }
    return options.headers.Authorization === 'Bearer expired' ? reply(401) : reply(200, {});
  });
  const a = h.session.requestJson('/api/ai/chat'), b = h.session.requestJson('/api/ai/chat');
  await new Promise(setImmediate);
  h.session.setUser(prev => ({ ...prev, avatar: 'new' }));
  pending.resolve(reply(200, rotated)); await Promise.all([a, b]);
  assert.equal(refreshes, 1); assert.equal(h.saved().avatar, 'new'); assert.equal(h.saved().refreshToken, 'r2');
});
test('a successful token rotation triggers one backend entitlement synchronization callback', async () => {
  let refreshed = 0;
  const h = await setup(async (url, options) => url.endsWith('/refresh')
    ? reply(200, rotated)
    : options.headers.Authorization === 'Bearer expired' ? reply(401) : reply(200, {}), {
    onRefreshed(user) { refreshed += 1; assert.equal(user.accessToken, 'fresh'); },
  });
  await h.session.requestJson('/api/account-data');
  assert.equal(refreshed, 1);
});
test('temporary refresh errors preserve login and never retry the AI request', async () => {
  for (const failure of [() => reply(503), () => { throw Error('offline'); }, () => reply(200, {})]) {
    let chats = 0;
    const h = await setup(async url => { if (url.endsWith('/refresh')) return failure(); chats++; return reply(401); });
    await assert.rejects(h.session.requestJson('/api/ai/chat'));
    assert.equal(h.session.getUser().refreshToken, 'r1'); assert.equal(h.ended(), 0); assert.equal(chats, 1);
  }
});
test('revocation, missing refresh token and a second 401 end the session without loops', async () => {
  for (const mode of ['revoked', 'missing', 'retry-rejected']) {
    let calls = 0;
    const h = await setup(async url => { calls++; return url.endsWith('/refresh') && mode === 'retry-rejected' ? reply(200, rotated) : reply(401); });
    if (mode === 'missing') h.session.setUser({ ...initial, refreshToken: '' });
    await assert.rejects(h.session.requestJson('/api/ai/chat'), { code: 'SESSION_EXPIRED' });
    await h.session.flush(); assert.equal(h.saved(), null); assert.equal(h.ended(), 1); assert.ok(calls <= 3);
  }
});
test('logout or account switch during refresh cannot restore or clear another session', async () => {
  for (const status of [200, 401]) for (const next of [null, { ...initial, _id: 'u2', sessionId: 's2', refreshToken: 'other' }]) {
    const pending = deferred();
    const h = await setup(async url => url.endsWith('/refresh') ? pending.promise : reply(401));
    const request = h.session.requestJson('/api/ai/chat');
    await new Promise(setImmediate); h.session.setUser(next);
    pending.resolve(reply(status, rotated));
    await assert.rejects(request, { code: 'SESSION_CHANGED' }); await h.session.flush();
    assert.deepEqual(h.saved(), next); assert.equal(h.ended(), 0);
  }
});
test('late tutor response after logout is discarded; 403 does not refresh or log out', async () => {
  const pending = deferred(); const h = await setup(() => pending.promise);
  const request = h.session.requestJson('/api/ai/chat'); h.session.setUser(null); pending.resolve(reply(200, { reply: 'Private' }));
  await assert.rejects(request, { code: 'SESSION_CHANGED' });
  let calls = 0; const forbidden = await setup(async () => { calls++; return reply(403, { error: 'Subscription required' }); });
  await assert.rejects(forbidden.session.requestJson('/api/ai/chat'), /Subscription required/);
  assert.equal(calls, 1); assert.equal(forbidden.ended(), 0);
});
test('refresh timeout preserves session; response body timeout is bounded too', async () => {
  for (const bodyStall of [false, true]) {
    const h = await setup(async (url, { signal }) => {
      if (!url.endsWith('/refresh')) return reply(401);
      const wait = () => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(Error('Timeout'), { name: 'AbortError' }))));
      return bodyStall ? { ok: true, status: 200, json: wait } : wait();
    }, { refreshTimeoutMs: 5 });
    await assert.rejects(h.session.requestJson('/api/ai/chat'), { name: 'AbortError' });
    assert.equal(h.session.getUser().refreshToken, 'r1'); assert.equal(h.ended(), 0);
  }
});
test('rotated credentials remain in memory on storage failure without silently claiming persistence', async () => {
  const h = await setup(async url => url.endsWith('/refresh') ? reply(200, rotated) : reply(401));
  h.storage.setItem = async () => { throw Error('disk full'); };
  await assert.rejects(h.session.requestJson('/api/ai/chat'), /could not be saved/);
  assert.equal(h.session.getUser().refreshToken, 'r2'); assert.equal(h.ended(), 0);
});
