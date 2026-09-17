const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto');
function service(env, fetch = async () => { throw Error('Unexpected provider call'); }) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/razorpayService.js'), 'utf8'), { module, require: () => crypto, process: { env }, Buffer, fetch, AbortSignal });
  return module.exports;
}
const env = { NODE_ENV: 'production', RAZORPAY_KEY_ID: 'rzp_test_old', RAZORPAY_KEY_SECRET: 'test-secret', RAZORPAY_PLAN_ID: 'plan_test', RAZORPAY_WEBHOOK_SECRET: 'test-hook', RAZORPAY_LIVE_KEY_ID: 'rzp_live_new', RAZORPAY_LIVE_KEY_SECRET: 'live-secret', RAZORPAY_LIVE_PLAN_ID: 'plan_live', RAZORPAY_LIVE_WEBHOOK_SECRET: 'live-hook' };
test('mode chooses isolated credentials and 499 INR default independently of NODE_ENV', () => {
  const r = service(env);
  assert.equal(r.requireConfig('test').keyId, 'rzp_test_old');
  assert.equal(r.requireConfig('live').secret, 'live-secret');
  assert.equal(r.requireConfig('live').planId, 'plan_live');
  assert.equal(r.config().monthlyAmount, 49900);
  assert.equal(r.config().trialAmount, 100);
  assert.equal(r.config().trialHours, 24);
  assert.throws(() => r.config('invalid'), /test or live/);
});
test('missing mode credentials fail closed without borrowing other mode secrets', () => {
  const r = service({ ...env, RAZORPAY_LIVE_KEY_SECRET: '' });
  assert.throws(() => r.requireConfig('live'), /key ID and key secret/);
  assert.throws(() => service({ ...env, RAZORPAY_LIVE_KEY_ID: 'rzp_test_wrong' }).requireConfig('live'), /prefix/);
});
test('existing billing mode explicitly selects API credentials after a mode switch', async () => {
  const calls = [];
  const r = service({ ...env, RAZORPAY_MODE: 'live' }, async (url, options) => { calls.push(options.headers.Authorization); return { ok: true, json: async () => ({}) }; });
  await r.api('/subscriptions/sub_old', 'GET', undefined, 'test');
  await r.api('/subscriptions/sub_new', 'GET', undefined, 'live');
  assert.equal(calls[0], 'Basic ' + Buffer.from('rzp_test_old:test-secret').toString('base64'));
  assert.equal(calls[1], 'Basic ' + Buffer.from('rzp_live_new:live-secret').toString('base64'));
});
function modeService({ planAmount = 49900, providerError = false } = {}) {
  let saved; const writes = []; const providerCalls = [];
  const r = service(env, async (url, opts) => { providerCalls.push({url, method: opts.method}); if(providerError) throw Error('network'); return {ok:true,json:async()=>({period:'monthly',interval:1,item:{amount:planAmount,currency:'INR'}})}; });
  const module = {exports:{}};
  const Settings = { findById: () => ({lean:async()=>saved}), findByIdAndUpdate: async (id, update) => {saved=update.$set; writes.push(saved);} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../services/paymentMode.js'),'utf8'), {module, process:{env}, require: name => name.includes('PaymentSettings') ? Settings : r});
  return { ...module.exports, writes, providerCalls };
}
test('admin mode persists only after read-only plan validation; summaries contain no credentials', async () => {
  const s = modeService(); assert.equal(await s.activeMode(),'test');
  const result = await s.select('live',{id:'admin'});
  assert.equal(await s.activeMode(),'live'); assert.equal(s.writes.length,1);
  assert.equal(s.providerCalls[0].method,'GET');
  assert.equal(result.modes.test.configured,true);
  assert.doesNotMatch(JSON.stringify(result),/test-secret|live-secret|live-hook|rzp_live_new/);
});
test('invalid plan amount or provider failure cannot change selected mode', async () => {
  for(const options of [{planAmount:50000},{providerError:true}]) {
    const s=modeService(options);await assert.rejects(s.select('live',{}));assert.equal(s.writes.length,0);assert.equal(await s.activeMode(),'test');
  }
});
test('both settings routes require admin authentication', () => {
  const routes=[];const admin=()=>{};const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../routes/paymentSettings.js'),'utf8'),{module,require:name=>name==='express'?{Router:()=>({get:(...r)=>routes.push(r),put:(...r)=>routes.push(r)})}:name.includes('adminAuth')?{protectAdmin:admin}:{}});
  assert.equal(routes.length,2);for(const route of routes)assert.equal(route[1],admin);
});
