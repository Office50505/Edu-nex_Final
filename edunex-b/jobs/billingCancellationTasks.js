const cron = require('node-cron');
const { scheduleLockedJob } = require('../services/distributedLock');
const { retryPendingBillingCancellations } = require('../services/billingCancellationRetry');

scheduleLockedJob({
  cron,
  expression: '*/15 * * * *',
  jobName: 'billing-cancellation-retry',
  lockTtlMs: 14 * 60 * 1000,
  task: async () => {
    const result = await retryPendingBillingCancellations();
    if (result.processed) console.log(`[CRON] Billing cancellation retries processed: ${result.processed}`);
  },
});
