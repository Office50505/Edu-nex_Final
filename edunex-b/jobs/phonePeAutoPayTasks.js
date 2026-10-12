const cron = require('node-cron');
const { scheduleLockedJob } = require('../services/distributedLock');
const { runDueBillings } = require('../services/phonePeAutoPayScheduler');

scheduleLockedJob({
  cron,
  expression: '* * * * *',
  jobName: 'phonepe-standard-autopay',
  lockTtlMs: 55 * 1000,
  task: async () => {
    const result = await runDueBillings();
    if (result.enabled && result.processed) {
      console.log(`[PHONEPE_AUTOPAY] scheduler processed=${result.processed}`);
    }
  },
});
