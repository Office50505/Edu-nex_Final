const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const babel = require('@babel/core');
const { normalizeIndianMobileInput } = require('../services/indianMobile');
const source = require('node:fs').readFileSync(require.resolve('../App.js'), 'utf8');
const ast = babel.parseSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } });
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) {
    const match = find(child, predicate); if (match) return match;
  }
  return null;
}
const slice = node => source.slice(node.start, node.end);

test('Indian numbers pasted with country code, spaces, brackets or hyphens retain all ten local digits', () => {
  for (const value of ['9876543210', '+919876543210', '919876543210', '+91 98765 43210', '+91 (98765)-43210', '98765-43210']) {
    assert.equal(normalizeIndianMobileInput(value), '9876543210');
  }
});

test('local numbers beginning with 91 keep their prefix and unsupported lengths remain invalid', () => {
  assert.equal(normalizeIndianMobileInput('9123456789'), '9123456789');
  for (const value of ['', '987654321', '98765432101', '+44 9876543210', '+9198765432100']) {
    assert.notEqual(normalizeIndianMobileInput(value).length, 10);
  }
});

test('repeated entry normalization and typing country-code digits do not lose any digits', () => {
  let entry = '';
  for (const digit of '919876543210') entry = normalizeIndianMobileInput(entry + digit);
  assert.equal(entry, '9876543210');
  assert.equal(normalizeIndianMobileInput(normalizeIndianMobileInput('+91 91234 56789')), '9123456789');
});

test('all three phone fields normalize complete pasted text without a native character limit', () => {
  for (const label of ['Phone Number', 'Mobile number', 'Registered mobile number']) {
    const input = find(ast, node => node.type === 'JSXOpeningElement' && node.name?.name === 'FieldInput'
      && node.attributes.some(attr => attr.name?.name === 'label' && attr.value?.value === label));
    assert.ok(input, label);
    assert.equal(input.attributes.some(attr => attr.name?.name === 'maxLength'), false, label);
    const change = input.attributes.find(attr => attr.name?.name === 'onChangeText').value.expression;
    let value;
    vm.runInNewContext(`(${slice(change)})('+91 (98765) 43210')`, {
      normalizeIndianMobileInput, setMobile: next => { value = next; }, setEmail: next => { value = next; }, onMobileChange: next => { value = next; },
    });
    assert.equal(value, '9876543210', label);
  }
});

function fixture(number) {
  const requests = [];
  const c = { normalizeIndianMobileInput, mobile: number, email: number, resetMobile: number,
    password: 'fixture-password', resetOtp: '123456', otp: '123456', resetNewPassword: 'fixture-password', resetConfirmPassword: 'fixture-password',
    signupFullName: 'Learner', signupPassword: 'fixture-password', signupAge: '20', signupGender: '', signupAvatar: 'a1', signupToken: 'verified-token',
    DEV_UI_QA_ENABLED: false, otpRequestInFlight: { current: false }, otpRequestGeneration: { current: 0 }, userRef: { current: null },
    postApiJson: async (path, body) => { requests.push({ path, body }); return { res: { ok: false }, data: { error: 'fixture rejection' } }; },
  };
  for (const setter of ['setLoginError', 'setLoginLoading', 'setOtpLoading', 'setSignupError', 'setOtpNotice', 'setSignupLoading',
    'setResetLoading', 'setResetError', 'setResetStep', 'setResetVisible']) c[setter] = () => {};
  c.setResetMobile = value => { c.resetMobile = value; };
  vm.createContext(c);
  for (const name of ['login', 'sendOtp', 'verifyOtp', 'register', 'requestPasswordReset', 'confirmPasswordReset', 'openPasswordReset']) {
    const fn = find(ast, node => node.type === 'FunctionDeclaration' && node.id?.name === name);
    vm.runInContext(slice(fn), c);
  }
  return { c, requests };
}

test('login, OTP send/resend/verify, registration and both reset requests submit the same normalized number', async () => {
  for (const number of ['+91 (98765) 43210', '9876543210', '9123456789']) {
    const expected = normalizeIndianMobileInput(number);
    for (const name of ['login', 'sendOtp', 'verifyOtp', 'register', 'requestPasswordReset', 'confirmPasswordReset']) {
      const f = fixture(number); await f.c[name]();
      assert.equal(f.requests.length, 1, name);
      assert.equal(f.requests[0].body.mobileNumber, expected, name);
    }
    const f = fixture(number); await f.c.sendOtp({ resend: true });
    assert.equal(f.requests[0].body.mobileNumber, expected);
  }
});

test('unsupported numbers cannot send authentication requests or be silently cropped to another number', async () => {
  for (const name of ['login', 'sendOtp', 'verifyOtp', 'register', 'requestPasswordReset', 'confirmPasswordReset']) {
    const f = fixture('+44 9876543210'); await f.c[name](); assert.equal(f.requests.length, 0, name);
  }
});

test('Forgot Password pre-fills the local number from a country-code login entry', () => {
  const f = fixture('+91 98765 43210'); f.c.openPasswordReset(); assert.equal(f.c.resetMobile, '9876543210');
});
