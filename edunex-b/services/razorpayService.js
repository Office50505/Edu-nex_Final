const crypto = require('node:crypto');

function legacyMode() {
  const explicit = process.env.RAZORPAY_LEGACY_MODE;
  if (explicit === 'test' || explicit === 'live') return explicit;
  return String(process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_live_') ? 'live' : 'test';
}
function config(mode = legacyMode()) {
  if (!['test', 'live'].includes(mode)) throw Object.assign(new Error('Choose test or live payment mode.'), { status: 400 });
  const prefix = `RAZORPAY_${mode.toUpperCase()}_`;
  const field = name => process.env[prefix + name] || (mode === legacyMode() ? process.env['RAZORPAY_' + name] : '') || '';
  const value = {
    mode, keyId: field('KEY_ID'), secret: field('KEY_SECRET'),
    webhookSecret: field('WEBHOOK_SECRET'), planId: field('PLAN_ID'), annualPlanId: field('ANNUAL_PLAN_ID'),
    annualAmount: Number(process.env.ANNUAL_SUBSCRIPTION_AMOUNT_PAISE || 499900),
    annualCycles: Number(process.env.ANNUAL_SUBSCRIPTION_TOTAL_COUNT || 10),
    trialAmount: Number(process.env.TRIAL_AMOUNT_PAISE || 100), monthlyAmount: Number(process.env.SUBSCRIPTION_AMOUNT_PAISE || 49900),
    trialHours: Number(process.env.TRIAL_DURATION_HOURS || 24), cycles: Number(process.env.SUBSCRIPTION_TOTAL_COUNT || 120),
    trialAccessHours: Number(process.env.TRIAL_ACCESS_DURATION_HOURS || process.env.TRIAL_ACCESS_HOURS || 26),
  };
  if (![value.trialAmount, value.monthlyAmount, value.trialHours, value.trialAccessHours, value.cycles, value.annualAmount, value.annualCycles].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error('Invalid billing amount, duration or cycle configuration.');
  if (value.trialAccessHours < value.trialHours) throw new Error('Trial access window cannot be shorter than the billing trial.');
  return value;
}
function credentials(mode) {
  const c = config(mode);
  if (!c.keyId || !c.secret) throw Object.assign(new Error('Razorpay needs key ID and key secret.'), { status: 503 });
  if (!c.keyId.startsWith(`rzp_${c.mode}_`)) throw Object.assign(new Error('Razorpay key prefix does not match the selected payment mode.'), { status: 503 });
  return c;
}
function requireConfig(mode, type = 'monthly') {
  const c = credentials(mode);
  if (!(type === 'annual' ? c.annualPlanId : c.planId) || !c.webhookSecret) throw Object.assign(new Error(`Set the ${c.mode} Razorpay ${type} plan ID and webhook secret before checkout.`), { status: 503 });
  return c;
}
async function api(route, method = 'GET', body, mode) {
  const c = credentials(mode);
  const response = await fetch(`https://api.razorpay.com/v1${route}`, {
    method, signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Basic ${Buffer.from(`${c.keyId}:${c.secret}`).toString('base64')}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error('Razorpay could not complete this request. Please retry or contact support.'), { status: 502, providerStatus: response.status });
  return data;
}
function validSignature(body, signature, secret) {
  if (!secret || typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(body).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
function planTerms(c, type) {
  return type === 'annual'
    ? { planId: c.annualPlanId, amount: c.annualAmount, period: 'yearly', cycles: c.annualCycles }
    : { planId: c.planId, amount: c.monthlyAmount, period: 'monthly', cycles: c.cycles };
}
function validatePlan(plan, c, type) {
  const terms = planTerms(c, type);
  if (plan.id !== terms.planId || plan.period !== terms.period || plan.interval !== 1 || plan.item?.amount !== terms.amount || plan.item?.currency !== 'INR') {
    throw Object.assign(new Error(`Razorpay plan must match the configured INR ${terms.period} price and interval.`), { status: 503 });
  }
}
function createPayload(c, type, attempt, now = Date.now()) {
  const terms = planTerms(c, type);
  const expiresAt = Math.ceil(now / 1000) + 600;
  if (type === 'trial' && (!Number.isSafeInteger(c.trialHours) || c.trialHours < 24)) {
    throw Object.assign(new Error('The introductory trial must provide at least 24 hours before renewal.'), { status: 503 });
  }
  return {
    plan_id: terms.planId, total_count: terms.cycles, quantity: 1, customer_notify: 1,
    expire_by: expiresAt,
    // The mandate may be authorised at any point in the checkout window.
    // Schedule from its end so a late checkout cannot shorten the paid trial.
    ...(type === 'trial' ? { start_at: expiresAt + c.trialHours * 3600,
      addons: [{ item: { name: 'Skillomate trial access', amount: c.trialAmount, currency: 'INR' } }] } : {}),
    notes: { checkout_attempt: attempt },
  };
}
function trialAccessEnd(c, trialEnd) {
  if (!trialEnd) return null;
  const billingHours = Number(c?.trialHours || 24);
  const accessHours = Number(c?.trialAccessHours || billingHours);
  const extraHours = Math.max(0, accessHours - billingHours);
  return new Date(new Date(trialEnd).getTime() + extraHours * 3600 * 1000);
}
function validateTrialSchedule(remote, billing) {
  if (billing.paymentType !== 'trial') return;
  const expected = new Date(billing.trialEnd).getTime() / 1000;
  if (!billing.trialEnd || !Number.isFinite(expected) || expected <= 0 || !Number.isSafeInteger(remote.start_at) || remote.start_at < expected) {
    throw Object.assign(new Error('The trial renewal schedule could not be verified. Please contact support before paying.'), { status: 503 });
  }
}
function entitlement(billing, remote, payments, now = Date.now()) {
  // Only captured, non-refunded payments count. Mandate approval alone grants nothing.
  const paid = payments.filter(item => item.payment.status === 'captured' && item.payment.currency === 'INR' && (item.payment.amount_refunded || 0) < item.payment.amount);
  const period = paid.filter(item => item.invoice.billing_end * 1000 > now && item.invoice.billing_start * 1000 <= now && item.payment.amount === (billing.recurringAmount ?? (billing.paymentType === 'annual' ? billing.annualAmount : billing.monthlyAmount)))
    .sort((a, b) => b.invoice.billing_end - a.invoice.billing_end)[0];
  if (period) return { status: 'active', currentPeriodStart: new Date(period.invoice.billing_start * 1000), currentPeriodEnd: new Date(period.invoice.billing_end * 1000), subscriptionType: billing.paymentType === 'annual' ? 'annual' : 'monthly' };
  const upfront = paid.find(item => !item.invoice.billing_start && item.payment.amount === billing.trialAmount);
  const trialAccessExpiry = billing.trialAccessEnd || billing.trialEnd;
  if (remote.status !== 'created' && billing.paymentType === 'trial' && upfront && new Date(trialAccessExpiry).getTime() > now) return {
    status: 'trial', trialStartedAt: new Date(upfront.payment.created_at * 1000), trialExpiresAt: trialAccessExpiry, subscriptionType: 'trial',
  };
  return { status: ['created', 'authenticated'].includes(remote.status) ? 'pending' : 'expired' };
}
module.exports = { legacyMode, config, requireConfig, api, validSignature, planTerms, validatePlan, createPayload, trialAccessEnd, validateTrialSchedule, entitlement };
