// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AdOfferPage } from '../../src/pages/AdOfferPage.jsx';
import { openRazorpay } from '../../src/lib/razorpayCheckout.js';

vi.mock('../../src/lib/razorpayCheckout.js', () => ({ openRazorpay: vi.fn() }));
let paid, navigate, requests;
beforeEach(() => {
  vi.useFakeTimers();
  openRazorpay.mockReset();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  paid = false;
  navigate = vi.fn();
  const originalWindow = window;
  vi.stubGlobal('window', new Proxy(originalWindow, {
    get(target, key) { return key === 'location' ? { assign: navigate } : Reflect.get(target, key); },
  }));
  sessionStorage.setItem('skillomateAdSession', 'verified-session');
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  openRazorpay.mockResolvedValue({ razorpay_payment_id: 'pay_test' });
  requests = vi.fn(async (url) => {
    const data = url.endsWith('/config') ? { gateway: 'razorpay' }
      : url.endsWith('/status') ? { accessGranted: paid, trialEligible: true }
      : url.endsWith('/verify') ? { accessGranted: false }
      : url.endsWith('/handoff') ? { code: 'verified-handoff' } : {};
    return { ok: true, json: async () => data };
  });
  vi.stubGlobal('fetch', requests);
});
afterEach(() => {
  cleanup(); sessionStorage.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});
const mount = async () => { await act(async () => { render(<AdOfferPage />); }); };
const handoffs = () => requests.mock.calls.filter(([url]) => url.endsWith('/handoff'));

it('automatically redirects after initially pending payment confirmation without another click', async () => {
  await mount();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Subscribe for ₹1/i })); });
  expect(screen.getByRole("dialog", { name: "Confirming your payment" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Open Razorpay again" })).toBeNull();
  expect(navigate).not.toHaveBeenCalled();
  paid = true;
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(screen.getByRole('dialog', { name: 'Payment successful' })).toBeTruthy();
  expect(navigate).not.toHaveBeenCalled();
  expect(screen.getByText(/Redirecting in 3 seconds/)).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(screen.getByText(/Redirecting in 2 seconds/)).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(navigate).toHaveBeenCalledWith('/signup#onboarding=verified-handoff');
  expect(handoffs()).toHaveLength(1);
  expect(openRazorpay).toHaveBeenCalledTimes(1);
});

it('recovers on return from a UPI app even when the checkout callback never arrives', async () => {
  openRazorpay.mockReturnValueOnce(new Promise(() => {}));
  await mount();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Subscribe for ₹1/i })); });
  await act(async () => { await vi.advanceTimersByTimeAsync(121000); });
  paid = true;
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  expect(navigate).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(navigate).toHaveBeenCalledTimes(1);
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(handoffs()).toHaveLength(1);
});

it('does not redirect unpaid sessions and stops background polling after two minutes', async () => {
  await mount();
  await act(async () => { await vi.advanceTimersByTimeAsync(121000); });
  const calls = requests.mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
  expect(requests).toHaveBeenCalledTimes(calls);
  expect(handoffs()).toHaveLength(0);
  expect(navigate).not.toHaveBeenCalled();
});

it('stops checking after the offer page unmounts', async () => {
  await mount(); cleanup(); const calls = requests.mock.calls.length;
  paid = true;
  await act(async () => { window.dispatchEvent(new Event('focus')); await vi.advanceTimersByTimeAsync(3000); });
  expect(requests).toHaveBeenCalledTimes(calls);
  expect(navigate).not.toHaveBeenCalled();
});

it('keeps slow confirmation honest and offers status checking instead of another payment', async () => {
  await mount();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Subscribe for ₹1/i })); });
  await act(async () => { await vi.advanceTimersByTimeAsync(121000); });
  expect(screen.getByRole('dialog', { name: 'Payment confirmation is taking longer' })).toBeTruthy();
  expect(screen.queryByText('Payment successful')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Open Razorpay again' })).toBeNull();
  expect(navigate).not.toHaveBeenCalled();
  paid = true;
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Check payment status' })); });
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(navigate).toHaveBeenCalledTimes(1);
});
it('never silently converts the one-rupee offer into immediate monthly checkout', async () => {
  const standard = requests.getMockImplementation();
  requests.mockImplementation(async (url, options) => url.endsWith('/status')
    ? { ok: true, json: async () => ({ accessGranted: false, trialEligible: false }) }
    : standard(url, options));
  await mount();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Subscribe for ₹1/i })); });
  expect(openRazorpay).not.toHaveBeenCalled();
  expect(screen.getByRole('heading', { name: 'Continue with monthly access' })).toBeTruthy();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Agree and continue for ₹499' })); });
  const checkout = requests.mock.calls.find(([url]) => url.endsWith('/checkout'));
  expect(JSON.parse(checkout[1].body)).toMatchObject({ paymentType: 'monthly', monthlyConsent: true });
  expect(openRazorpay).toHaveBeenCalledOnce();
});
it('does not show success or count down until the signup handoff is ready', async () => {
  paid = true;
  const standard = requests.getMockImplementation();
  requests.mockImplementation(async (url, options) => url.endsWith('/handoff')
    ? { ok: false, json: async () => ({ error: 'Verification in progress' }) }
    : standard(url, options));
  await mount();
  await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
  expect(screen.queryByText('Payment successful')).toBeNull();
  expect(navigate).not.toHaveBeenCalled();
});
it('restores pending confirmation after refresh without reopening payment', async () => {
  sessionStorage.setItem('skillomateAdAwaitingPayment', '1');
  await mount();
  expect(screen.getByRole('dialog', { name: 'Confirming your payment' })).toBeTruthy();
  expect(openRazorpay).not.toHaveBeenCalled();
  paid = true;
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(navigate).toHaveBeenCalledOnce();
});
it('cancels the success countdown on unmount', async () => {
  paid = true;
  await mount();
  expect(screen.getByRole('dialog', { name: 'Payment successful' })).toBeTruthy();
  cleanup();
  await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
  expect(navigate).not.toHaveBeenCalled();
});

it('checks captured trial access after a provider failure instead of asking for another payment', async () => {
  openRazorpay.mockRejectedValueOnce(new Error('A payment attempt was unsuccessful'));
  await mount();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Subscribe for ₹1/i })); });
  expect(screen.getByRole('dialog', { name: 'Confirming your payment' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Open Razorpay again' })).toBeNull();
  paid = true;
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(navigate).toHaveBeenCalledOnce();
  expect(openRazorpay).toHaveBeenCalledOnce();
});
