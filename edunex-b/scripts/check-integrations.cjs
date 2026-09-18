require('dotenv').config({ path: require('node:path').join(__dirname, '../.env'), quiet: true });

let missing = false;
const required = ['OTP_PROVIDER', 'PAYMENT_GATEWAY_MODE'];
const otpProvider = String(process.env.OTP_PROVIDER || process.env.OTP_DELIVERY_PROVIDER || '').trim().toLowerCase();
const paymentGateway = String(process.env.PAYMENT_GATEWAY_MODE || '').trim().toLowerCase();

if (otpProvider === 'msg91') {
  required.push('MSG91_AUTH_KEY', 'MSG91_TEMPLATE_ID');
} else {
  console.log(`OTP_PROVIDER is ${otpProvider || 'not set'}; MSG91 live credentials are not required for this mode.`);
}

if (paymentGateway === 'razorpay') {
  const razorpay = require('../services/razorpayService');
  for (const mode of ['test', 'live']) {
    const configured = razorpay.config(mode);
    if (!configured.keyId && !configured.secret) continue;
    try {
      razorpay.requireConfig(mode);
      console.log(`Razorpay ${mode} monthly: configured`);
    } catch { console.log(`Razorpay ${mode} monthly: INCOMPLETE`); missing = true; }
    console.log(`Razorpay ${mode} annual: ${configured.annualPlanId ? 'configured (provider validation required)' : 'not configured; yearly checkout unavailable in this mode'}`);
  }
} else if (paymentGateway === 'phonepe') {
  required.push('PHONEPE_CLIENT_ID', 'PHONEPE_CLIENT_SECRET', 'PHONEPE_MERCHANT_ID', 'PHONEPE_SALT_KEY', 'PHONEPE_SALT_INDEX', 'PHONEPE_BASE_URL', 'PHONEPE_CALLBACK_URL', 'PHONEPE_REDIRECT_URL');
} else if (paymentGateway === 'simulated') {
  console.log('PAYMENT_GATEWAY_MODE is simulated; live payment provider credentials are not required for this mode.');
} else {
  console.log(`PAYMENT_GATEWAY_MODE is ${paymentGateway || 'not set'}; no provider-specific checks were selected.`);
}

for (const name of required) {
  const value = process.env[name]?.trim();
  const present = Boolean(value && !/your[_ -].*key|replace[_ -]?me|placeholder/i.test(value));
  console.log(`${name}: ${present ? 'set' : 'MISSING'}`);
  if (!present) missing = true;
}
if (otpProvider === 'msg91') {
  for (const name of ['MSG91_DLT_TEMPLATE_ID', 'MSG91_SENDER_ID']) console.log(`${name}: ${process.env[name]?.trim() ? 'set (verify mapping in MSG91)' : 'not recorded locally; verify mapping in MSG91'}`);
  if (process.env.AUTO_VERIFY_OTP === 'true') { console.log('AUTO_VERIFY_OTP must be false for real OTP verification.'); missing = true; }
}
console.log('Configuration presence only; no SMS, provider calls, or payments were made.');
process.exitCode = missing ? 1 : 0;
