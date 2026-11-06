const test = require('node:test');
const assert = require('node:assert/strict');

const contract = import('../../edunex-f/marketing-web/src/lib/checkoutContract.mjs');
const pricing = { gateway: 'phonepe', checkoutEnabled: true, autoRenewEnabled: true, subscriptionAmountPaise: 49900 };

test('marketing accepts the server monthly AutoPay contract and rejects legacy one-time pricing', async () => {
  const { parseMonthlyPricing } = await contract;
  assert.equal(parseMonthlyPricing(pricing), pricing);
  for (const invalid of [null, {}, { ...pricing, checkoutEnabled: false }, { ...pricing, autoRenewEnabled: false },
    { gateway: 'phonepe', checkoutEnabled: true, oneTimeAmountPaise: 49900 },
    { ...pricing, subscriptionAmountPaise: 0 }, { ...pricing, subscriptionAmountPaise: 1.5 },
    { ...pricing, gateway: 'simulated' }]) assert.throws(() => parseMonthlyPricing(invalid), /unavailable/);
});

test('marketing checkout requires explicit renewal consent and sends server-supported payment type', async () => {
  const { monthlyCheckoutPayload } = await contract;
  for (const consent of [false, undefined, 'true']) assert.throws(() => monthlyCheckoutPayload(pricing, consent, '/return'), /Confirm/);
  assert.deepEqual(monthlyCheckoutPayload(pricing, true, '/return'), {
    paymentType: 'monthly', mandateConsent: true, monthlyConsent: true, returnUrl: '/return',
  });
  assert.throws(() => monthlyCheckoutPayload(null, true, '/return'), /unavailable/);
});

test('local sandbox handoff stays local and production handoff keeps the configured app origin', async () => {
  const { checkoutSignupUrl } = await contract;
  assert.equal(checkoutSignupUrl('code /?', 'http://localhost:3001', '', true), 'http://localhost:5173/signup#onboarding=code%20%2F%3F');
  assert.equal(checkoutSignupUrl('code', 'http://127.0.0.1:3001', '', true), 'http://127.0.0.1:5173/signup#onboarding=code');
  assert.equal(checkoutSignupUrl('code', 'http://localhost:3001', '', false), 'https://skillomate.in/signup#onboarding=code');
  assert.equal(checkoutSignupUrl('code', 'http://localhost:3001', 'https://staging.example/', true), 'https://staging.example/signup#onboarding=code');
});
