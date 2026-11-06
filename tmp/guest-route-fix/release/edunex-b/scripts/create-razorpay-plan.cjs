// Explicit operator action: creates a provider plan; never run automatically on startup.
require('dotenv').config({ path: require('node:path').join(__dirname, '../.env'), quiet: true });
const { config, api } = require('../services/razorpayService');
(async () => {
  const c = config(process.env.RAZORPAY_MODE || undefined);
  if (c.planId) throw new Error('The selected mode already has a plan ID. Reuse the existing plan.');
  const plan = await api('/plans', 'POST', { period: 'monthly', interval: 1, item: { name: 'Skillomate Monthly', amount: c.monthlyAmount, currency: 'INR', description: 'Monthly learning access' } }, c.mode);
  console.log(`Add RAZORPAY_${c.mode.toUpperCase()}_PLAN_ID=${plan.id} to your backend .env.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
