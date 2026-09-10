const test = require('node:test');
const assert = require('node:assert/strict');
const helpers = import('../../edunex-f/src/lib/authNavigation.js');
function storage() { const data = new Map(); return { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }; }
test('registered phone is prefilled once without appearing in login URL', async () => {
  const { saveLoginPrefill, readLoginPrefill, clearLoginPrefill, loginDestination } = await helpers;
  const store = storage(); saveLoginPrefill('+919876543210', store, 1000);
  assert.equal(readLoginPrefill(store, 2000), '9876543210');
  assert.equal(loginDestination('/payment.html?courseId=123', 'https://example.com'), '/login.html?next=%2Fpayment.html%3FcourseId%3D123');
  clearLoginPrefill(store); assert.equal(readLoginPrefill(store, 2000), '');
});
test('expired phone and unsafe next destinations are discarded', async () => {
  const { saveLoginPrefill, readLoginPrefill, loginDestination } = await helpers;
  const store = storage(); saveLoginPrefill('9876543210', store, 1000);
  assert.equal(readLoginPrefill(store, 301001), '');
  for (const next of ['https://evil.example', '//evil.example', 'javascript:alert(1)']) assert.equal(loginDestination(next, 'https://example.com'), '/login.html?next=%2Fpayment.html');
});
test('signup prefill is isolated, expires, and preserves a safe destination', async () => {
  const { saveSignupPrefill, readSignupPrefill, clearSignupPrefill, readLoginPrefill, signupDestination } = await helpers;
  const store = storage();
  saveSignupPrefill('+919876543210', store, 1000);
  assert.equal(readSignupPrefill(store, 2000), '9876543210');
  assert.equal(readLoginPrefill(store, 2000), '');
  assert.equal(readSignupPrefill(store, 301001), '');
  assert.equal(signupDestination('/payment.html?courseId=123', 'https://example.com'), '/signup.html?next=%2Fpayment.html%3FcourseId%3D123');
  assert.equal(signupDestination('//evil.example', 'https://example.com'), '/signup.html?next=%2Fpayment.html');
  clearSignupPrefill(store);
  assert.equal(readSignupPrefill(store, 2000), '');
});
