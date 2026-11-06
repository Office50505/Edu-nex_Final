require('dotenv').config();

const mongoose = require('mongoose');
const RazorpayBilling = require('../models/RazorpayBilling');
const User = require('../models/User');
const { reconcile } = require('../controllers/razorpayController');
const { getMongoConnectionOptions } = require('../config/mongodb');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(uri, getMongoConnectionOptions());

  const records = await RazorpayBilling.find({
    subscriptionId: { $nin: [null, ''] },
    phase: { $in: ['ready', 'uncertain', 'creating'] },
  }).sort({ updatedAt: -1 }).lean();

  const report = [];
  for (const record of records) {
    const before = {
      userId: String(record._id),
      subscriptionId: record.subscriptionId,
      phase: record.phase,
    };
    try {
      const subscription = await reconcile(record);
      const user = await User.findById(record._id).select('fullName mobileNumber subscriptionStatus subscriptionExpiry').lean();
      const latest = await RazorpayBilling.findById(record._id).select('phase updatedAt').lean();
      report.push({
        ...before,
        ok: true,
        user: user?.fullName || user?.mobileNumber || before.userId,
        localUserStatus: user?.subscriptionStatus || 'none',
        localBillingPhase: latest?.phase || before.phase,
        providerStatus: subscription?.razorpayStatus || 'not recorded',
        localSubscriptionStatus: subscription?.status || 'none',
      });
    } catch (error) {
      report.push({
        ...before,
        ok: false,
        error: error.message || 'Unknown sync error',
      });
    }
  }

  const summary = report.reduce((acc, row) => {
    acc.total += 1;
    if (row.ok) acc.synced += 1;
    else acc.failed += 1;
    acc.byProviderStatus[row.providerStatus || 'error'] = (acc.byProviderStatus[row.providerStatus || 'error'] || 0) + 1;
    acc.byBillingPhase[row.localBillingPhase || row.phase || 'unknown'] = (acc.byBillingPhase[row.localBillingPhase || row.phase || 'unknown'] || 0) + 1;
    return acc;
  }, { total: 0, synced: 0, failed: 0, byProviderStatus: {}, byBillingPhase: {} });

  console.log(JSON.stringify({ summary, rows: report }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
