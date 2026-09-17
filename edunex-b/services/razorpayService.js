const crypto = require('node:crypto');

function config() {
  const value = {
    keyId: process.env.RAZORPAY_KEY_ID || '', secret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '', planId: process.env.RAZORPAY_PLAN_ID || '',
    trialAmount: Number(process.env.TRIAL_AMOUNT_PAISE || 100), monthlyAmount: Number(process.env.SUBSCRIPTION_AMOUNT_PAISE || 50000),
    trialHours: Number(process.env.TRIAL_DURATION_HOURS || 24), cycles: Number(process.env.SUBSCRIPTION_TOTAL_COUNT || 120),
  };
  if (![value.trialAmount, value.monthlyAmount, value.trialHours, value.cycles].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error('Invalid billing amount, duration or cycle configuration.');
  return value;
}
function credentials() {
  const c = config();
  if (!c.keyId || !c.secret) throw Object.assign(new Error('Razorpay needs key ID and key secret.'), { status: 503 });
  if (process.env.NODE_ENV === 'production' && !c.keyId.startsWith('rzp_live_')) throw Object.assign(new Error('Use Razorpay live keys in production.'), { status: 503 });
  if (process.env.NODE_ENV !== 'production' && !c.keyId.startsWith('rzp_test_')) throw Object.assign(new Error('Use Razorpay test keys outside production.'), { status: 503 });
  return c;
}
function requireConfig() {
  const c = credentials();
  if (!c.planId || !c.webhookSecret) throw Object.assign(new Error('Set RAZORPAY_PLAN_ID and RAZORPAY_WEBHOOK_SECRET before checkout.'), { status: 503 });
  return c;
}
async function api(route, method = 'GET', body) {
  const c = credentials();
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
function createPayload(c, type, attempt, now = Date.now()) {
  return {
    plan_id: c.planId, total_count: c.cycles, quantity: 1, customer_notify: 1,
    expire_by: Math.floor(now / 1000) + 600,
    ...(type === 'trial' ? { start_at: Math.floor(now / 1000) + c.trialHours * 3600,
      addons: [{ item: { name: 'Skillomate trial access', amount: c.trialAmount, currency: 'INR' } }] } : {}),
    notes: { checkout_attempt: attempt },
  };
}
function entitlement(billing, remote, payments, now = Date.now()) {
  // Only captured, non-refunded payments count. Mandate approval alone grants nothing.
  const paid = payments.filter(item => item.payment.status === 'captured' && item.payment.currency === 'INR' && (item.payment.amount_refunded || 0) < item.payment.amount);
  const period = paid.filter(item => item.invoice.billing_end * 1000 > now && item.invoice.billing_start * 1000 <= now && item.payment.amount === billing.monthlyAmount)
    .sort((a, b) => b.invoice.billing_end - a.invoice.billing_end)[0];
  if (period) return { status: 'active', currentPeriodStart: new Date(period.invoice.billing_start * 1000), currentPeriodEnd: new Date(period.invoice.billing_end * 1000), subscriptionType: 'monthly' };
  const upfront = paid.find(item => !item.invoice.billing_start && item.payment.amount === billing.trialAmount);
  if (remote.status !== 'created' && billing.paymentType === 'trial' && upfront && new Date(billing.trialEnd).getTime() > now) return {
    status: 'trial', trialStartedAt: new Date(upfront.payment.created_at * 1000), trialExpiresAt: billing.trialEnd, subscriptionType: 'trial',
  };
  return { status: ['created', 'authenticated'].includes(remote.status) ? 'pending' : 'expired' };
}
module.exports = { config, requireConfig, api, validSignature, createPayload, entitlement };
