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
  expect(screen.getByText(/Confirming your payment automatically/)).toBeTruthy();
  expect(navigate).not.toHaveBeenCalled();
  paid = true;
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
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
