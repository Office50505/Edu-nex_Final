// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { openRazorpay } from '../../src/lib/razorpayCheckout.js';
afterEach(() => { delete window.Razorpay; });
it('opens UPI checkout with a handler on the current page and forwards the signed result', async () => {
  let options;
  const open = vi.fn();
  window.Razorpay = class { constructor(value) { options = value; } on() {} open() { open(); } };
  const resultPromise = openRazorpay({ keyId: 'test_key', subscriptionId: 'sub_test' });
  await Promise.resolve();
  expect(open).toHaveBeenCalledTimes(1);
  expect(options.subscription_id).toBe('sub_test');
  expect(options.callback_url).toBeUndefined();
  expect(options.config.display.blocks.upi.instruments).toEqual([{ method: 'upi' }]);
  const signed = { razorpay_payment_id: 'pay_test', razorpay_subscription_id: 'sub_test', razorpay_signature: 'signature' };
  options.handler(signed);
  expect(await resultPromise).toEqual(signed);
});
