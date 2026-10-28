const test = require('node:test');
const assert = require('node:assert/strict');
const { isMockPaymentEnabled, mockPaymentResult } = require('../services/mockPayments');

test('mock billing requires Android development and explicit opt-in', () => {
  assert.equal(isMockPaymentEnabled(true, 'true', 'android'), true);
  for (const [dev, flag, platform] of [
    [false, 'true', 'android'], [undefined, 'true', 'android'],
    [true, undefined, 'android'], [true, 'false', 'android'], [true, 'true', 'ios'],
  ]) assert.equal(isMockPaymentEnabled(dev, flag, platform), false);
});

test('simulated outcomes remain separate from actual subscription entitlement', () => {
  for (const outcome of ['success', 'failure', 'cancel']) {
    const result = mockPaymentResult(outcome);
    assert.deepEqual(Object.keys(result).sort(), ['error', 'notice']);
    assert.match(result.error || result.notice, /No money was charged/);
  }
  assert.match(mockPaymentResult('success').notice, /Premium access is unchanged/);
  assert.match(mockPaymentResult('failure').error, /declined/);
  assert.match(mockPaymentResult('cancel').notice, /cancelled/);
});
