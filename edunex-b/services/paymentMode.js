const Settings = require('../models/PaymentSettings');
const rzp = require('./razorpayService');
async function activeMode() {
  const saved = await Settings.findById('razorpay').lean();
  return saved?.mode || process.env.RAZORPAY_MODE || rzp.legacyMode();
}
function readiness(mode) {
  try {
    const c = rzp.requireConfig(mode);
    if (c.webhookSecret === rzp.config(mode === 'test' ? 'live' : 'test').webhookSecret) throw new Error('Use different webhook secrets for Test and Live.');
    return { configured: true, annualConfigured: Boolean(c.annualPlanId) };
  }
  catch (error) { return { configured: false, detail: error.message }; }
}
async function summary() {
  return { mode: await activeMode(), modes: { test: readiness('test'), live: readiness('live') } };
}
async function select(mode, admin) {
  rzp.requireConfig(mode);
  const ready = readiness(mode);
  if (!ready.configured) throw Object.assign(new Error(ready.detail), { status: 409 });
  const c = rzp.config(mode);
  // Read-only provider check: do not enable an invalid plan or mismatched price.
  const plan = await rzp.api(`/plans/${encodeURIComponent(c.planId)}`, 'GET', undefined, mode);
  if (plan.period !== 'monthly' || plan.interval !== 1 || plan.item?.amount !== c.monthlyAmount || plan.item?.currency !== 'INR') {
    throw Object.assign(new Error('This mode needs an INR monthly plan matching the configured subscription price.'), { status: 409 });
  }
  if (c.annualPlanId) {
    const annualPlan = await rzp.api(`/plans/${encodeURIComponent(c.annualPlanId)}`, 'GET', undefined, mode);
    rzp.validatePlan(annualPlan, c, 'annual');
  }
  await Settings.findByIdAndUpdate('razorpay', { $set: { mode, updatedBy: String(admin?.id || admin?._id || 'admin') } }, { upsert: true, runValidators: true });
  return summary();
}
module.exports = { activeMode, summary, select };
