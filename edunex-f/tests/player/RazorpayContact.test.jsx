// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { openRazorpay } from '../../src/lib/razorpayCheckout.js';
afterEach(() => { delete window.Razorpay; });
it.each(['9000090000', '919000090000', '+91 90000 90000'])('prefills and locks the verified number %s without an email requirement', async contact => {
  let options;
  window.Razorpay = class {
    constructor(value) { options = value; }
    on() {}
    open() { options.handler({ razorpay_payment_id: 'test' }); }
  };
  await openRazorpay({ keyId: 'test', subscriptionId: 'sub_test', prefill: { contact, email: '', name: ' ' } });
  expect(options.prefill).toEqual({ contact: '+919000090000' });
  expect(options.hidden).toEqual({ contact: true, email: true });
  expect(options.readonly.contact).toBe(true);
});
it('keeps phone entry available when the server has no number', async () => {
  let options;
  window.Razorpay = class { constructor(value) { options=value; } on() {} open() { options.handler({}); } };
  await openRazorpay({ prefill: { email: ' learner@example.com ' } });
  expect(options.hidden.contact).toBe(false);
  expect(options.readonly.contact).toBe(false);
  expect(options.prefill.email).toBe('learner@example.com');
});
