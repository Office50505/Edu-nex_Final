export function parseMonthlyPricing(data) {
  if (data?.gateway !== 'phonepe' || data.checkoutEnabled !== true || data.autoRenewEnabled !== true
    || !Number.isSafeInteger(data.subscriptionAmountPaise) || data.subscriptionAmountPaise <= 0) {
    throw new Error('Monthly AutoPay checkout is unavailable. Please try again later.');
  }
  return data;
}

export function monthlyCheckoutPayload(pricing, consent, returnUrl) {
  parseMonthlyPricing(pricing);
  if (consent !== true) throw new Error('Confirm the monthly AutoPay terms before continuing.');
  return { paymentType: 'monthly', mandateConsent: true, monthlyConsent: true, returnUrl };
}

export function checkoutSignupUrl(code, marketingOrigin, configuredAppOrigin = '', development = false) {
  const marketing = new URL(marketingOrigin);
  const local = development && ['localhost', '127.0.0.1'].includes(marketing.hostname);
  const origin = (configuredAppOrigin || (local ? `http://${marketing.hostname}:5173` : 'https://skillomate.in')).replace(/\/+$/, '');
  return `${origin}/signup#onboarding=${encodeURIComponent(code)}`;
}
