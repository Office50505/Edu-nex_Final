require('dotenv').config({ path: require('node:path').join(__dirname, '../.env'), quiet: true });

const required = ['OTP_PROVIDER', 'PAYMENT_GATEWAY_MODE'];
const otpProvider = String(process.env.OTP_PROVIDER || process.env.OTP_DELIVERY_PROVIDER || '').trim().toLowerCase();
const paymentGateway = String(process.env.PAYMENT_GATEWAY_MODE || '').trim().toLowerCase();

if (otpProvider === 'msg91') {
  required.push('MSG91_AUTH_KEY', 'MSG91_TEMPLATE_ID');
} else {
  console.log(`OTP_PROVIDER is ${otpProvider || 'not set'}; MSG91 live credentials are not required for this mode.`);
}

if (paymentGateway === 'razorpay') {
  required.push('RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_PLAN_ID', 'RAZORPAY_WEBHOOK_SECRET');
} else if (paymentGateway === 'phonepe') {
  required.push('PHONEPE_CLIENT_ID', 'PHONEPE_CLIENT_SECRET', 'PHONEPE_MERCHANT_ID', 'PHONEPE_SALT_KEY', 'PHONEPE_SALT_INDEX', 'PHONEPE_BASE_URL', 'PHONEPE_CALLBACK_URL', 'PHONEPE_REDIRECT_URL');
} else if (paymentGateway === 'simulated') {
  console.log('PAYMENT_GATEWAY_MODE is simulated; live payment provider credentials are not required for this mode.');
} else {
  console.log(`PAYMENT_GATEWAY_MODE is ${paymentGateway || 'not set'}; no provider-specific checks were selected.`);
}

let missing = false;
for (const name of required) {
  const present = Boolean(process.env[name]?.trim());
  console.log(`${name}: ${present ? 'set' : 'MISSING'}`);
  if (!present) missing = true;
}
console.log('Configuration presence only; no SMS, provider calls, or payments were made.');
process.exitCode = missing ? 1 : 0;
