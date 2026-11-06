const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function setup({ valid = true, exists = true } = {}) {
  const handlers = new Map(); const writes = []; const checks = [];
  const user = { _id: 'fixture-user', mobileNumber: '919876543210' };
  const router = Object.fromEntries(['get', 'post', 'patch', 'put', 'delete'].map(method => [method, (route, ...callbacks) => handlers.set(route, callbacks.at(-1))]));
  const User = { findOne: async () => exists ? user : null, findByIdAndUpdate: async (...args) => writes.push(args) };
  const Session = { updateMany: async (...args) => writes.push(args) };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/auth.js'), 'utf8'), {
    module, console, process: { env: { NODE_ENV: 'development', OTP_PROVIDER: 'demo', AUTO_VERIFY_OTP: 'true' } },
    require(name) {
      if (name === 'express') return { Router: () => router };
      if (name === 'bcryptjs') return { hash: async value => `hashed:${value}` };
      if (name.endsWith('/User')) return User;
      if (name.endsWith('/Session')) return Session;
      if (name.endsWith('/otpService')) return { OTP_LENGTH: 6, normalizeMobileNumber: value => String(value || '').replace(/\D/g, ''),
        sendMobileOtp: async () => ({ ok: true, provider: 'msg91' }),
        verifyMobileOtp: async (...args) => { checks.push(args); return { ok: valid, error: 'Invalid OTP' }; } };
      if (name.endsWith('/rateLimitToggle')) return { isAuthRateLimitDisabled: () => false };
      if (name.endsWith('/sensitiveRateLimit')) return { sensitiveRateLimit: () => (_req, _res, next) => next() };
      if (name.endsWith('/compatAuth')) return { requireCompatibleAuth: () => () => {} };
      if (name.startsWith('../')) return {};
      return require(name);
    },
  });
  return { checks, writes, async call(route, body) {
    let status; let data;
    await handlers.get(route)({ body, headers: {}, ip: '127.0.0.1' }, { status(value) { status = value; return this; }, json(value) { data = value; } });
    return { status, data };
  } };
}
const body = { mobileNumber: '919876543210', otp: '012345', newPassword: 'new-password' };
test('reset cannot bypass OTP even when signup AUTO_VERIFY_OTP is enabled', async () => {
  const f = setup({ valid: false });
  assert.equal((await f.call('/password-reset/confirm', body)).status, 400);
  assert.equal(f.checks.length, 1);
  assert.equal(f.writes.length, 0);
});
test('verified reset hashes password and revokes user and session credentials', async () => {
  const f = setup();
  assert.equal((await f.call('/password-reset/confirm', body)).status, 200);
  assert.equal(f.writes[0][1].$set.passwordHash, 'hashed:new-password');
  assert.equal(f.writes[0][1].$set.activeSessionId, null);
  assert.equal(f.writes[0][1].$set.activeSessions.length, 0);
  assert.equal(f.writes[0][1].$set.deviceToken, null);
  assert.ok(f.writes[1][1].$set.loggedOutAt);
});
test('weak passwords are rejected before consuming OTP', async () => {
  const f = setup();
  assert.equal((await f.call('/password-reset/confirm', { ...body, newPassword: 'short' })).status, 400);
  assert.equal(f.checks.length, 0);
  assert.equal(f.writes.length, 0);
});
test('request hides unknown accounts and confirmation cannot change one', async () => {
  const known = setup(); const unknown = setup({ exists: false });
  const a = await known.call('/password-reset/request', body);
  const b = await unknown.call('/password-reset/request', body);
  assert.equal(a.data.message, b.data.message);
  assert.equal(b.status, 200);
  assert.equal((await unknown.call('/password-reset/confirm', body)).status, 400);
  assert.equal(unknown.writes.length, 0);
});
