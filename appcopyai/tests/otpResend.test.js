const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');
const { normalizeIndianMobileInput } = require('../services/indianMobile');
const source = fs.readFileSync(require.resolve('../App.js'), 'utf8');
const ast = babel.parseSync(source, { babelrc: false, configFile: false, parserOpts: { plugins: ['jsx'] } });
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) {
    const found = find(child, predicate); if (found) return found;
  }
  return null;
}
const slice = node => source.slice(node.start, node.end);
function fixture(request = async () => ({ res: { ok: true }, data: {} }), qa = false) {
  const c = { mobile: '9876543210', otp: '123456', otpSent: true, signupToken: '', signupError: '', otpNotice: '', otpLoading: false,
    screen: 'signup1', otpRequestInFlight: { current: false }, otpRequestGeneration: { current: 0 }, userRef: { current: null },
    DEV_UI_QA_ENABLED: qa, postApiJson: request, normalizeIndianMobileInput,
    useCallback: fn => fn,
    setTimeout: callback => { c.delayed = callback; },
  };
  for (const [setter, field] of Object.entries({ setOtp: 'otp', setOtpSent: 'otpSent', setSignupToken: 'signupToken',
    setSignupError: 'signupError', setOtpNotice: 'otpNotice', setOtpLoading: 'otpLoading', setScreen: 'screen', setMobile: 'mobile' })) c[setter] = value => { c[field] = value; };
  for (const setter of ['setSignupFullName', 'setSignupPassword', 'setSignupGender', 'setSignupAge', 'setSignupAvatar']) c[setter] = () => {};
  vm.createContext(c);
  const invalidate = find(ast, node => node.type === 'VariableDeclarator' && node.id?.name === 'invalidateOtpRequest');
  vm.runInContext(`this.invalidateOtpRequest = ${slice(invalidate.init)};`, c);
  for (const name of ['sendOtp', 'verifyOtp', 'resetSignup']) {
    const fn = find(ast, node => node.type === 'FunctionDeclaration' && node.id?.name === name);
    vm.runInContext(slice(fn), c);
  }
  return c;
}

test('Resend calls the dedicated endpoint and stays on code entry with visible success feedback', async () => {
  let requested;
  const c = fixture(async (paths, body) => { requested = { paths, body }; return { res: { ok: true }, data: {} }; });
  await c.sendOtp({ resend: true });
  assert.equal(requested.paths[0], '/api/auth/resend-mobile-otp');
  assert.equal(requested.body.mobileNumber, '9876543210');
  assert.equal(c.otpSent, true); assert.equal(c.screen, 'signup1'); assert.equal(c.otp, '');
  assert.match(c.otpNotice, /OTP resent/); assert.equal(c.otpLoading, false); assert.equal(c.otpRequestInFlight.current, false);
});

test('initial Send OTP retains the original send endpoint', async () => {
  let path; const c = fixture(async paths => { path = paths[0]; return { res: { ok: true }, data: {} }; });
  c.otpSent = false; await c.sendOtp();
  assert.equal(path, '/api/auth/send-otp'); assert.equal(c.otpSent, true); assert.match(c.otpNotice, /OTP sent/);
});

test('server cooldown and network errors remain visible without removing the existing code', async () => {
  for (const request of [async () => ({ res: { ok: false, status: 429 }, data: { error: 'Try again in 30 seconds.' } }),
    async () => { throw new Error('offline'); }]) {
    const c = fixture(request); c.otpNotice = 'Old success';
    await c.sendOtp({ resend: true });
    assert.ok(c.signupError); assert.equal(c.otpNotice, ''); assert.equal(c.otp, '123456');
    assert.equal(c.otpSent, true); assert.equal(c.otpLoading, false); assert.equal(c.otpRequestInFlight.current, false);
  }
});

test('rapid Resend taps and Verify while resending make only one request', async () => {
  let resolve; let calls = 0;
  const c = fixture(() => { calls++; return new Promise(done => { resolve = done; }); });
  const pending = c.sendOtp({ resend: true });
  await c.sendOtp({ resend: true }); await c.verifyOtp();
  assert.equal(calls, 1); assert.equal(c.otpLoading, true);
  resolve({ res: { ok: true }, data: {} }); await pending;
  assert.equal(c.otpLoading, false); assert.equal(c.otpRequestInFlight.current, false);
});

test('Resend during verification cannot replace the code being checked', async () => {
  let resolve; let calls = 0;
  const c = fixture(() => { calls++; return new Promise(done => { resolve = done; }); });
  const pending = c.verifyOtp(); await c.sendOtp({ resend: true });
  assert.equal(calls, 1);
  resolve({ res: { ok: true }, data: { signupToken: 'verified-token' } }); await pending;
  assert.equal(c.screen, 'signup2'); assert.equal(c.signupToken, 'verified-token');
});

test('development QA resend simulates delivery and releases the request lock', async () => {
  const c = fixture(() => assert.fail('QA must not send a real SMS'), true);
  await c.sendOtp({ resend: true }); assert.equal(c.otpLoading, true);
  c.delayed(); assert.equal(c.otpSent, true); assert.match(c.otpNotice, /OTP resent/); assert.equal(c.otpRequestInFlight.current, false);
});

test('visible Resend button invokes resend and exposes its disabled loading state', async () => {
  const button = find(ast, node => node.type === 'JSXOpeningElement' && node.attributes.some(attr => attr.name?.name === 'accessibilityLabel'
    && attr.value?.value === 'Resend mobile verification code'));
  const press = button.attributes.find(attr => attr.name?.name === 'onPress').value.expression;
  const c = fixture(); await vm.runInContext(`(${slice(press)})()`, c); assert.match(c.otpNotice, /OTP resent/);
  const disabled = button.attributes.find(attr => attr.name?.name === 'disabled').value.expression;
  c.otpLoading = true; assert.equal(vm.runInContext(slice(disabled), c), true);
});

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const success = { res: { ok: true }, data: { signupToken: 'fixture-verified-token' } };

test('leaving signup during sending, resending or verification ignores late success', async () => {
  for (const action of ['send', 'resend', 'verify']) {
    const response = deferred(); const c = fixture(() => response.promise);
    c.otpSent = action !== 'send';
    const pending = action === 'verify' ? c.verifyOtp() : c.sendOtp({ resend: action === 'resend' });
    c.resetSignup(); response.resolve(success); await pending;
    assert.equal(c.screen, 'login', action); assert.equal(c.mobile, '', action);
    assert.equal(c.otpSent, false, action); assert.equal(c.signupToken, '', action);
    assert.equal(c.otpNotice, '', action); assert.equal(c.otpLoading, false, action);
  }
});

test('late network and server errors cannot appear after leaving signup', async () => {
  for (const verify of [false, true]) for (const network of [false, true]) {
    const response = deferred(); const c = fixture(() => response.promise);
    const pending = verify ? c.verifyOtp() : c.sendOtp({ resend: true });
    c.resetSignup();
    if (network) response.reject(new Error('offline'));
    else response.resolve({ res: { ok: false }, data: { error: 'old server error' } });
    await pending; assert.equal(c.signupError, ''); assert.equal(c.screen, 'login');
  }
});

test('an old response cannot unlock a newer request or clear its loading indicator', async () => {
  for (const oldFails of [false, true]) {
    const old = deferred(), fresh = deferred(); let count = 0;
    const c = fixture(() => ++count === 1 ? old.promise : fresh.promise);
    const first = c.verifyOtp(); c.resetSignup();
    c.screen = 'signup1'; c.mobile = '9123456789';
    const second = c.sendOtp();
    if (oldFails) old.reject(new Error('old network failure')); else old.resolve(success);
    await first;
    assert.equal(c.screen, 'signup1'); assert.equal(c.otpLoading, true);
    assert.equal(c.otpRequestInFlight.current, true); assert.equal(c.otpSent, false); assert.equal(c.signupToken, '');
    await c.sendOtp(); assert.equal(count, 2);
    fresh.resolve(success); await second;
    assert.equal(c.mobile, '9123456789'); assert.equal(c.otpSent, true); assert.equal(c.otpLoading, false);
  }
});

function runOtpLifecycle(c) {
  const effect = find(ast, node => node.type === 'CallExpression' && node.callee?.name === 'useEffect'
    && slice(node.arguments[0]).includes('otpRequestGeneration.current'));
  return vm.runInContext(`(${slice(effect.arguments[0])})()`, c);
}

test('changing phone or screen invalidates the old request through the actual lifecycle effect', async () => {
  for (const change of [c => { c.mobile = '9123456789'; }, c => { c.screen = 'login'; }]) {
    const response = deferred(); const c = fixture(() => response.promise); c.otpSent = false;
    const cleanup = runOtpLifecycle(c); const pending = c.sendOtp();
    change(c); cleanup(); runOtpLifecycle(c); response.resolve(success); await pending;
    assert.equal(c.otpSent, false); assert.equal(c.otpNotice, ''); assert.equal(c.otpLoading, false);
  }
});

test('unmount cleanup prevents delayed verification from navigating or storing a token', async () => {
  const response = deferred(); const c = fixture(() => response.promise);
  const cleanup = runOtpLifecycle(c); const pending = c.verifyOtp(); cleanup();
  response.resolve(success); await pending;
  assert.equal(c.screen, 'signup1'); assert.equal(c.signupToken, '');
});

test('signing in while an OTP request is pending discards the old verification response', async () => {
  const response = deferred(); const c = fixture(() => response.promise);
  const pending = c.verifyOtp(); c.userRef.current = { _id: 'signed-in-user' };
  response.resolve(success); await pending;
  assert.equal(c.screen, 'signup1'); assert.equal(c.signupToken, '');
});

test('delayed QA callbacks cannot reopen signup or unlock a newer request', async () => {
  for (const verify of [false, true]) {
    const c = fixture(undefined, true); c.otp = '000000';
    await (verify ? c.verifyOtp() : c.sendOtp()); const oldCallback = c.delayed;
    c.resetSignup(); c.screen = 'signup1'; c.mobile = '9123456789';
    await c.sendOtp(); const newCallback = c.delayed;
    oldCallback(); assert.equal(c.otpSent, false); assert.equal(c.signupToken, ''); assert.equal(c.otpLoading, true);
    newCallback(); assert.equal(c.otpSent, true); assert.equal(c.otpLoading, false);
  }
});
