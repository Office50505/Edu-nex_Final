// Explicit operator action: creates a provider plan; never run automatically on startup.
require('dotenv').config({ path: require('node:path').join(__dirname, '../.env'), quiet: true });
const { config, api } = require('../services/razorpayService');
(async () => {
  const c = config();
  if (c.planId) throw new Error('RAZORPAY_PLAN_ID is already set. Reuse the existing plan.');
  const plan = await api('/plans', 'POST', { period: 'monthly', interval: 1, item: { name: 'Skillomate Monthly', amount: c.monthlyAmount, currency: 'INR', description: 'Monthly learning access' } });
  console.log(`Add RAZORPAY_PLAN_ID=${plan.id} to your backend .env.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
