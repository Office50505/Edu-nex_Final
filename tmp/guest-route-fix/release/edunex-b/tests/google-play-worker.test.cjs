const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function worker(env = {}) {
  let scheduled;
  const calls = [];
  vm.runInNewContext(fs.readFileSync(require.resolve('../jobs/googlePlayReconciliationTasks'), 'utf8'), {
    process: { env }, console: { log() {} },
    require: name => {
      if (name === 'node-cron') return {};
      if (name === '../services/distributedLock') return { scheduleLockedJob: options => { scheduled = options; } };
      if (name === '../services/googlePlayIapService') return { createGooglePlayIapService: () => ({
        reconcileDuePurchases: async options => { calls.push(options); return { checked: 1, processed: 1 }; },
      }) };
      throw new Error(`Unexpected worker dependency ${name}`);
    },
  });
  return { scheduled, calls };
}

test('Google reconciliation uses a five-minute distributed schedule and bounded provider refresh batches', async () => {
  const harness = worker({ GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: 'test-credential-presence-only' });
  assert.equal(harness.scheduled.expression, '*/5 * * * *');
  assert.equal(harness.scheduled.jobName, 'google-play-reconciliation');
  assert.equal(harness.scheduled.lockTtlMs, 4 * 60_000);
  await harness.scheduled.task();
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0].limit, 50);
});

test('unconfigured Google worker skips provider calls and accepts the base64 credential alternative', async () => {
  const disabled = worker();
  await disabled.scheduled.task();
  assert.equal(disabled.calls.length, 0);
  const configured = worker({ GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64: 'test-credential-presence-only' });
  await configured.scheduled.task();
  assert.equal(configured.calls.length, 1);
});
