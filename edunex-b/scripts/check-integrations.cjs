require('dotenv').config({ path: require('node:path').join(__dirname, '../.env'), quiet: true });
let missing = false;
for (const name of ['OTP_PROVIDER', 'MSG91_AUTH_KEY', 'MSG91_TEMPLATE_ID', 'PAYMENT_GATEWAY_MODE', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_PLAN_ID', 'RAZORPAY_WEBHOOK_SECRET']) {
  const present = Boolean(process.env[name]?.trim());
  console.log(`${name}: ${present ? 'set' : 'MISSING'}`);
  if (!present) missing = true;
}
console.log('Configuration presence only; no SMS, provider calls, or payments were made.');
process.exitCode = missing ? 1 : 0;
