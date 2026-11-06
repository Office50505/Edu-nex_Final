const test = require('node:test');
const assert = require('node:assert/strict');
const { systemHealth } = require('../services/systemHealthService');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const countModel = count => ({ countDocuments: () => ({ maxTimeMS: async () => count }) });
function dependencies(env = {}) {
  return { env, uptime: () => 12, connection: { readyState: 1, db: { command: async () => ({ ok: 1 }) } }, Course: countModel(8), RazorpayBilling: countModel(0), BillingWebhook: { findOne: () => ({ sort() { return this; }, select() { return this; }, maxTimeMS() { return this; }, lean: async () => null }) } };
}
test('diagnostics distinguish live success from unverified providers and never leak credentials', async () => {
  const input = dependencies({ FAL_KEY: 'private-ai-secret', MSG91_AUTH_KEY: 'private-sms-secret', MSG91_TEMPLATE_ID: 'template', OTP_PROVIDER: 'msg91', PAYMENT_GATEWAY_MODE: 'razorpay', RAZORPAY_KEY_ID: 'rzp_test_private', RAZORPAY_KEY_SECRET: 'private-payment-secret', RAZORPAY_PLAN_ID: 'plan', RAZORPAY_WEBHOOK_SECRET: 'private-webhook-secret' });
  const report = await systemHealth(input);
  const byId = Object.fromEntries(report.checks.map(check => [check.id, check]));
  assert.equal(byId.database.status, 'healthy');
  assert.equal(byId.ai.status, 'unverified');
  assert.equal(byId.otp.status, 'unverified');
  assert.equal(byId.payments.status, 'unverified');
  assert.equal(byId.webhooks.status, 'unverified');
  for (const value of Object.values(input.env).filter(value => value.includes('private'))) assert.ok(!JSON.stringify(report).includes(value));
  assert.equal(Object.values(report.summary).reduce((a,b) => a+b, 0), report.checks.length);
});
test('missing plan and disabled jobs need attention', async () => {
  const report = await systemHealth(dependencies({ PAYMENT_GATEWAY_MODE: 'razorpay', DISABLE_BACKGROUND_JOBS: 'true' }));
  assert.match(report.checks.find(check => check.id === 'payments').detail, /RAZORPAY_PLAN_ID/);
  assert.equal(report.checks.find(check => check.id === 'jobs').status, 'attention');
});
test('database outage skips dependent queries instead of claiming they pass', async () => {
  const input = dependencies(); input.connection.readyState = 0;
  input.Course.countDocuments = () => { throw new Error('Must not query'); };
  const report = await systemHealth(input);
  assert.equal(report.checks.find(check => check.id === 'database').status, 'error');
  assert.equal(report.checks.find(check => check.id === 'catalogue').evidence, 'Check skipped');
});
test('individual query failure does not hide other diagnostics', async () => {
  const input = dependencies(); input.Course.countDocuments = () => ({ maxTimeMS: async () => { throw new Error('secret db detail'); } });
  input.RazorpayBilling = countModel(2);
  const report = await systemHealth(input);
  assert.equal(report.checks.find(check => check.id === 'catalogue').status, 'error');
  assert.equal(report.checks.find(check => check.id === 'checkout-recovery').status, 'attention');
  assert.ok(!JSON.stringify(report).includes('secret db detail'));
});
test('health endpoint requires admin middleware', () => {
  let route; const guard = () => {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/adminHealth.js'), 'utf8'), {
    module: { exports: {} }, require(name) {
      if(name === 'express') return { Router: () => ({ get: (...args) => { route = args; } }) };
      if(name.includes('adminAuth')) return { protectAdmin: guard };
      return {};
    },
  });
  assert.equal(route[0], '/system-health'); assert.equal(route[1], guard);
});
