const cron = require('node-cron');
const { scheduleLockedJob } = require('../services/distributedLock');
const { createGooglePlayIapService } = require('../services/googlePlayIapService');

const service = createGooglePlayIapService();
// Provider refresh/retry only. Google determines all paid periods and renewal charges.
scheduleLockedJob({
  cron,
  expression: '*/5 * * * *',
  jobName: 'google-play-reconciliation',
  lockTtlMs: 4 * 60_000,
  task: async () => {
    if (!process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON && !process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64) return;
    const result = await service.reconcileDuePurchases({ limit: 50 });
    if (result.checked) console.log(`[CRON] Google Play reconciliation checked=${result.checked} processed=${result.processed}`);
  },
});
