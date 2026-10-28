const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { recordApplePurchaseError } = require('../services/applePurchaseDiagnostics');

test('captures native code, message and nested StoreKit cause without serializing raw fields', () => {
  const events = [];
  const error = Object.assign(new Error('Purchase failed'), {
    code: 'purchase-error',
    underlyingError: JSON.stringify({ domain: 'ASDErrorDomain', code: 500,
      underlyingError: { domain: 'AMSErrorDomain', code: 100, message: 'Authentication failed' } }),
    purchaseToken: 'PRIVATE_PURCHASE_TOKEN', transactionReceipt: 'PRIVATE_RECEIPT',
    appAccountToken: 'PRIVATE_ACCOUNT', userInfo: { email: 'private@example.com' },
  });
  const result = recordApplePurchaseError('purchase_listener', error, (...args) => events.push(args));
  assert.equal(result.error.code, 'purchase-error');
  assert.equal(result.error.message, 'Purchase failed');
  assert.equal(result.error.underlyingError.domain, 'ASDErrorDomain');
  assert.equal(result.error.underlyingError.underlyingError.code, 100);
  assert.equal(events[0][0], '[Skillomate Apple IAP]');
  assert.doesNotMatch(JSON.stringify(events), /PRIVATE_|private@example/);
});

test('redacts sensitive text, bounds cause depth and survives logger failures', () => {
  const error = { code: 'network-error', message: 'Cannot reach https://example.com/private?secret=123 for private@example.com',
    debugMessage: '{"receipt":"PRIVATE_RECEIPT"}' };
  error.underlyingError = error;
  const result = recordApplePurchaseError('purchase_request', error, () => { throw Error('logger unavailable'); });
  const json = JSON.stringify(result);
  assert.doesNotMatch(json, /PRIVATE_RECEIPT|example.com|private@/);
  assert.ok(json.length < 2000);
  assert.equal(result.error.underlyingError.underlyingError.underlyingError, null);
});

test('actual hook records native callbacks while preserving cancellation behavior', () => {
  let callbacks, state = [], calls = [];
  const source = fs.readFileSync(require.resolve('../services/useAppleSubscriptions'), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export function useAppleSubscriptions', 'function useAppleSubscriptions');
  const context = {
    Platform: { OS: 'ios' }, AppState: {}, console, setTimeout, clearTimeout, setInterval, clearInterval,
    useCallback: fn => fn, useEffect() {}, useMemo: fn => fn(), useRef: current => ({ current }),
    useState: initial => [initial, value => state.push(value)],
    ErrorCode: { UserCancelled: 'cancelled', Pending: 'pending', DeferredPayment: 'deferred' },
    APPLE_SUBSCRIPTION_PRODUCT_IDS: { monthly: 'com.skillomate.premium.monthly' },
    recordApplePurchaseError: (stage, error) => calls.push({ stage, error }),
    ...require('../services/applePurchaseRecovery'),
    useDeferredIapConnection: options => { callbacks = options; return { connected: true, subscriptions: [] }; },
  };
  vm.runInNewContext(source + '\nuseAppleSubscriptions({ user: {_id:"test"}, session:{} });', context);
  const error = { code: 'network-error', message: 'Connection lost' };
  callbacks.onPurchaseError(error);
  assert.equal(calls[0].stage, 'purchase_listener');
  assert.equal(calls[0].error, error);
  assert.ok(state.includes('Could not reach the App Store. Check your connection and try again.'));
  state = [];
  callbacks.onPurchaseError({ code: 'cancelled' });
  assert.ok(state.includes('Purchase cancelled. No charge was made.'));
  assert.equal(state.at(-1), '');
  callbacks.onError(error);
  assert.equal(calls.at(-1).stage, 'store_connection');
});
