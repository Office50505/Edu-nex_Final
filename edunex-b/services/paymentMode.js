const Settings = require('../models/PaymentSettings');
const rzp = require('./razorpayService');
const phonePe = require('./phonePeService');

function formatRupees(paise) {
  return `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function describePlanMismatch(plan, c) {
  const actualAmount = Number.isFinite(plan?.item?.amount) ? formatRupees(plan.item.amount) : 'missing amount';
  const actualCurrency = plan?.item?.currency || 'missing currency';
  const actualPeriod = plan?.period && plan?.interval ? `${plan.interval} ${plan.period}` : 'missing period';
  return `Live mode needs Razorpay plan ${c.planId} to be INR ${formatRupees(c.monthlyAmount)} every 1 monthly cycle. Current Razorpay plan is ${actualCurrency} ${actualAmount} every ${actualPeriod}. Update RAZORPAY_LIVE_PLAN_ID to a matching monthly plan or change SUBSCRIPTION_AMOUNT_PAISE.`;
}
function envProvider() {
  const provider = String(process.env.PAYMENT_GATEWAY_MODE || 'razorpay').trim().toLowerCase();
  return provider === 'phonepe' ? 'phonepe' : 'razorpay';
}

function localProviderOverride() {
  if (process.env.NODE_ENV === 'production') return null;
  const provider = String(process.env.PAYMENT_GATEWAY_LOCAL_PROVIDER || '').trim().toLowerCase();
  return ['razorpay', 'phonepe'].includes(provider) ? provider : null;
}

async function activeSettings() {
  const localProvider = localProviderOverride();
  if (localProvider) {
    return {
      provider: localProvider,
      mode: process.env.RAZORPAY_MODE || rzp.legacyMode(),
    };
  }

  const saved = await Settings.findById('gateway').lean()
    || await Settings.findById('razorpay').lean();
  return {
    provider: saved?.provider || envProvider(),
    mode: saved?.mode || process.env.RAZORPAY_MODE || rzp.legacyMode(),
  };
}

async function activeMode() {
  const saved = await activeSettings();
  return saved?.mode || process.env.RAZORPAY_MODE || rzp.legacyMode();
}
async function activeProvider() {
  const saved = await activeSettings();
  return saved.provider;
}
function razorpayReadiness(mode) {
  try {
    const c = rzp.requireConfig(mode);
    if (c.webhookSecret === rzp.config(mode === 'test' ? 'live' : 'test').webhookSecret) throw new Error('Use different webhook secrets for Test and Live.');
    return { configured: true, annualConfigured: Boolean(c.annualPlanId) };
  }
  catch (error) { return { configured: false, detail: error.message }; }
}
async function summary() {
  const current = await activeSettings();
  return {
    provider: current.provider,
    mode: current.mode,
    providers: {
      razorpay: {
        configured: razorpayReadiness(current.mode).configured,
        modes: { test: razorpayReadiness('test'), live: razorpayReadiness('live') },
      },
      phonepe: phonePe.readiness(),
    },
    modes: { test: razorpayReadiness('test'), live: razorpayReadiness('live') },
  };
}
async function select(mode, admin, provider = 'razorpay') {
  const selectedProvider = String(provider || 'razorpay').trim().toLowerCase();
  if (!['razorpay', 'phonepe'].includes(selectedProvider)) throw Object.assign(new Error('Choose Razorpay or PhonePe.'), { status: 400 });
  if (selectedProvider === 'phonepe') {
    const ready = phonePe.readiness();
    if (!ready.configured) throw Object.assign(new Error(ready.detail), { status: 409 });
    const current = await activeSettings();
    await Settings.findByIdAndUpdate('gateway', { $set: { provider: 'phonepe', mode: current.mode, updatedBy: String(admin?.id || admin?._id || 'admin') } }, { upsert: true, runValidators: true });
    return summary();
  }
  rzp.requireConfig(mode);
  const ready = razorpayReadiness(mode);
  if (!ready.configured) throw Object.assign(new Error(ready.detail), { status: 409 });
  const c = rzp.config(mode);
  // Read-only provider check: do not enable an invalid plan or mismatched price.
  const plan = await rzp.api(`/plans/${encodeURIComponent(c.planId)}`, 'GET', undefined, mode);
  if (plan.period !== 'monthly' || plan.interval !== 1 || plan.item?.amount !== c.monthlyAmount || plan.item?.currency !== 'INR') {
    throw Object.assign(new Error(describePlanMismatch(plan, c)), { status: 409 });
  }
  if (c.annualPlanId) {
    const annualPlan = await rzp.api(`/plans/${encodeURIComponent(c.annualPlanId)}`, 'GET', undefined, mode);
    rzp.validatePlan(annualPlan, c, 'annual');
  }
  await Settings.findByIdAndUpdate('gateway', { $set: { provider: 'razorpay', mode, updatedBy: String(admin?.id || admin?._id || 'admin') } }, { upsert: true, runValidators: true });
  return summary();
}
module.exports = { activeMode, activeProvider, activeSettings, summary, select };
