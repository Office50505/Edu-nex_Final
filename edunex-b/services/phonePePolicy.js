function paymentGatewayMode(env = process.env) {
  return String(env.PAYMENT_GATEWAY_MODE || '').trim().toLowerCase();
}

function isPhonePeEnabled(env = process.env) {
  return String(env.PHONEPE_ENABLED || '').trim().toLowerCase() === 'true';
}

function isPhonePeNewPaymentsEnabled(env = process.env) {
  return isPhonePeEnabled(env)
    && paymentGatewayMode(env) === 'phonepe'
    && String(env.PHONEPE_NEW_PAYMENTS_ENABLED || '').trim().toLowerCase() === 'true';
}

function isPhonePeNewPaymentsSwitchEnabled(env = process.env) {
  return isPhonePeEnabled(env)
    && String(env.PHONEPE_NEW_PAYMENTS_ENABLED || '').trim().toLowerCase() === 'true';
}

function newCheckoutProvider(env = process.env) {
  const mode = paymentGatewayMode(env);
  if (mode === 'razorpay') return 'razorpay';
  if (mode === 'simulated' && env.NODE_ENV !== 'production') return 'simulated';
  if (mode === 'phonepe' && isPhonePeNewPaymentsEnabled(env)) return 'phonepe';
  return 'disabled';
}

module.exports = { isPhonePeEnabled, isPhonePeNewPaymentsEnabled, isPhonePeNewPaymentsSwitchEnabled, newCheckoutProvider, paymentGatewayMode };
