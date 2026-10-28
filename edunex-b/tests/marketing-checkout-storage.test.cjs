const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../../edunex-f/marketing-web/node_modules/typescript');
const source = fs.readFileSync(require.resolve('../../edunex-f/marketing-web/src/components/MarketingCheckoutFlow.tsx'), 'utf8');
const functions = source.slice(source.indexOf('function readPersistedCheckoutSession'), source.indexOf('function apiPath'));

function storage(blocked = false) {
  const values = new Map();
  return {
    getItem(key) { if (blocked) throw new Error('Storage blocked'); return values.get(key) || null; },
    setItem(key, value) { if (blocked) throw new Error('Storage blocked'); values.set(key, value); },
    removeItem(key) { if (blocked) throw new Error('Storage blocked'); values.delete(key); },
  };
}

function harness(sessionBlocked, localBlocked) {
  const context = vm.createContext({
    window: { sessionStorage: storage(sessionBlocked), localStorage: storage(localBlocked) },
    SESSION_KEY: 'checkout', PERSISTED_SESSION_KEY: 'checkout:persisted', AWAITING_KEY: 'awaiting', CHECKOUT_SESSION_TTL_MS: 3600000,
  });
  vm.runInContext(ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
  return context;
}

for (const [sessionBlocked, localBlocked] of [[true, false], [false, true], [false, false]]) {
  test(`checkout survives unavailable storage: session=${sessionBlocked}, local=${localBlocked}`, () => {
    const h = harness(sessionBlocked, localBlocked);
    h.saveCheckoutSession('fixture-token');
    assert.equal(h.readCheckoutSession(), 'fixture-token');
    h.setAwaitingPayment();
    assert.equal(h.readAwaitingPayment(), '1');
    h.clearCheckoutSession(); h.clearAwaitingPayment();
    assert.equal(h.readCheckoutSession(), '');
    assert.equal(h.readAwaitingPayment(), null);
  });
}

test('both storage providers may be blocked without throwing during checkout or cleanup', () => {
  const h = harness(true, true);
  assert.doesNotThrow(() => { h.saveCheckoutSession('fixture'); h.setAwaitingPayment(); h.clearCheckoutSession(); h.clearAwaitingPayment(); });
  assert.equal(h.readCheckoutSession(), '');
});

test('expired persisted checkout sessions are removed rather than restored', () => {
  const h = harness(true, false);
  h.window.localStorage.setItem('checkout:persisted', JSON.stringify({ token: 'old', expiresAt: Date.now() - 1000 }));
  assert.equal(h.readCheckoutSession(), '');
  assert.equal(h.window.localStorage.getItem('checkout:persisted'), null);
});
