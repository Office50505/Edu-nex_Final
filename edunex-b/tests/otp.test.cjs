const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { EventEmitter } = require('node:events');
function service() {
  let record; const requests = []; let reply = { type: 'success', message: 'ok' };
  const module = { exports: {} };
  const model = {
    async findById() { return record; },
    async findOneAndUpdate(query, update) {
      if (query.attempts) {
        if (!record || record.attempts >= 5 || record.expiresAt <= new Date()) return null;
        record.attempts++; return { ...record };
      }
      if (record && record.nextSendAt > new Date()) throw Object.assign(new Error('duplicate'), { code: 11000 });
      record = { _id: query._id, ...update.$set }; return record;
    },
    async deleteOne(query) { if (!record || record.generation !== query.generation) return { deletedCount: 0 }; record = null; return { deletedCount: 1 }; },
  };
  const https = { request(url, options, callback) {
    requests.push({ url: String(url), options });
    const request = new EventEmitter(); request.setTimeout = () => {}; request.write = () => {};
    request.end = () => queueMicrotask(() => { const response = new EventEmitter(); response.statusCode = 200; response.setEncoding = () => {}; callback(response); response.emit('data', JSON.stringify(reply)); response.emit('end'); });
    return request;
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/otpService.js'), 'utf8'), { module, URL, Date, console, process: { env: { NODE_ENV: 'development', OTP_DELIVERY_PROVIDER: 'msg91', MSG91_AUTH_KEY: 'fixture-secret', MSG91_TEMPLATE_ID: 'fixture-template' } },
    require(name) { if (name === 'https') return https; if (name.includes('OtpAttempt')) return model; return require(name); },
  });
  return { api: module.exports, requests, setReply(value) { reply = value; }, expireCooldown() { record.nextSendAt = new Date(0); }, expireOtp() { record.expiresAt = new Date(0); } };
}
test('MSG91 alias is honored and client development flag cannot bypass SMS', async () => {
  const s = service(); const result = await s.api.sendMobileOtp('9876543210', { forceDevelopment: true });
  assert.equal(result.provider, 'msg91'); assert.equal(result.devOtp, undefined);
  assert.match(s.requests[0].url, /mobile=919876543210/);
  assert.doesNotMatch(s.requests[0].url, /fixture-secret/);
  assert.equal(s.requests[0].options.headers.authkey, 'fixture-secret');
});
test('cooldown blocks repeats; resend uses MSG91 retry endpoint', async () => {
  const s = service(); await s.api.sendMobileOtp('9876543210');
  assert.equal((await s.api.resendMobileOtp('9876543210')).ok, false);
  assert.equal(s.requests.length, 1);
  s.expireCooldown(); assert.equal((await s.api.resendMobileOtp('9876543210')).ok, true);
  assert.match(s.requests[1].url, /otp\/retry/);
});
test('verification consumes OTP once and blocks replay', async () => {
  const s = service(); await s.api.sendMobileOtp('9876543210');
  assert.equal((await s.api.verifyMobileOtp('9876543210', '123456')).ok, true);
  assert.equal((await s.api.verifyMobileOtp('9876543210', '123456')).ok, false);
});
test('provider errors and malformed success responses fail closed', async () => {
  for (const reply of [{ type: 'error', message: 'Invalid OTP' }, {}, 'not json']) {
    const s = service(); await s.api.sendMobileOtp('9876543210'); s.setReply(reply);
    assert.equal((await s.api.verifyMobileOtp('9876543210', '123456')).ok, false);
  }
});
test('five failed attempts block further verification and expiry blocks valid-looking OTP', async () => {
  const s = service(); await s.api.sendMobileOtp('9876543210'); s.setReply({ type: 'error', message: 'Invalid OTP' });
  for (let i = 0; i < 5; i++) await s.api.verifyMobileOtp('9876543210', '123456');
  s.setReply({ type: 'success' });
  assert.equal((await s.api.verifyMobileOtp('9876543210', '123456')).ok, false);
  assert.equal(s.requests.length, 6);
  const expired = service(); await expired.api.sendMobileOtp('9876543210'); expired.expireOtp();
  assert.equal((await expired.api.verifyMobileOtp('9876543210', '123456')).ok, false);
});
