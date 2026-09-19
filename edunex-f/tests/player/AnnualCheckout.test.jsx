// @vitest-environment jsdom
import React from 'react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { PaymentPage } from '../../src/pages/PaymentPage.jsx';
import { ProfilePage } from '../../src/pages/ProfilePage.jsx';
import { PricingPage } from '../../src/pages/PricingPage.jsx';
import { openRazorpay } from '../../src/lib/razorpayCheckout.js';
vi.mock('../../src/legacyRuntime.js', () => ({ runLegacyPage: () => () => {} }));
vi.mock('../../src/hooks/usePageStyle.js', () => ({ usePageStyle: () => {} }));
vi.mock('../../src/hooks/useEduNexRuntimeReady.js', () => ({ useEduNexRuntimeReady: () => true }));
vi.mock('../../src/lib/razorpayCheckout.js', () => ({ openRazorpay: vi.fn(async () => ({ razorpay_subscription_id: 'sub_monthly' })) }));
const pricing = { subscriptionAmountPaise: 49900, trialAmountPaise: 100, trialHours: 24 };
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) });
function mockApi(config = pricing, eligible = true) {
  const fetcher = vi.fn(async (url, options) => {
    if (url.endsWith('/config')) return response(config);
    if (url.endsWith('/subscription-status')) return response({ status: 'none', trialEligible: eligible });
    if (url.endsWith('/initiate-trial')) return response({ gateway: 'razorpay', subscriptionId: 'sub_monthly', paymentType: JSON.parse(options.body).paymentType });
    if (url.endsWith('/razorpay/verify')) return response({ accessGranted: true });
    throw Error('Unexpected URL ' + url);
  });
  vi.stubGlobal('fetch', fetcher); return fetcher;
}
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('edunexAccessToken', 'token'); window.history.replaceState(null, '', '/payment'); vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete window.EduNex; });
it('pricing exposes the monthly plan without an annual checkout', () => {
  render(<PricingPage />);
  expect(screen.getByRole('heading', { name: 'Monthly subscription' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: /Annual plan/i })).toBeNull();
  expect(screen.getAllByRole('link', { name: /Try 24 Hours for ₹1/ })[0].getAttribute('href')).toBe('/payment');
});
it('a used-trial account is offered only the monthly subscription', async () => {
  const fetcher = mockApi(pricing, false); render(<PaymentPage />);
  const button = await screen.findByRole('button', { name: /Subscribe for ₹499(?:\.00)?\/month/ });
  expect(button.disabled).toBe(false); expect(screen.getByText(/one-time trial has already been used/i)).toBeTruthy();
  fireEvent.click(button);
  await screen.findByText("You're already subscribed!");
  expect(JSON.parse(fetcher.mock.calls.find(([url]) => url.endsWith('/initiate-trial'))[1].body)).toEqual({ paymentType: 'monthly', mandateConsent: true });
  expect(openRazorpay).toHaveBeenCalledTimes(1);
});
it('a legacy annual checkout URL cannot restore the annual plan', async () => {
  window.history.replaceState(null, '', '/payment?plan=annual');
  mockApi(pricing, false); render(<PaymentPage />);
  expect(await screen.findByRole('button', { name: /Subscribe for ₹499(?:\.00)?\/month/ })).toBeTruthy();
  expect(screen.queryByText(/₹4,999|Annual plan|yearly checkout/i)).toBeNull();
});
it('default checkout still sends trial payment type', async () => {
  window.history.replaceState(null, '', '/payment'); const fetcher = mockApi(); render(<PaymentPage />);
  fireEvent.click(await screen.findByRole('button', { name: /Try 24 Hours/ }));
  await waitFor(() => expect(openRazorpay).toHaveBeenCalledTimes(1));
  expect(JSON.parse(fetcher.mock.calls.find(([url]) => url.endsWith('/initiate-trial'))[1].body).paymentType).toBe('trial');
});

it('monthly renewal cancellation requires confirmation and keeps the paid expiry visible', async () => {
  const user = { _id: 'u1', fullName: 'Learner', subscriptionStatus: 'active' };
  localStorage.setItem('edunexUser', JSON.stringify(user));
  const api = vi.fn(async (url) => {
    if (url === '/api/auth/me') return { user };
    if (url.endsWith('/subscription-status')) return { status: 'active', subscriptionType: 'monthly', currentPeriodEnd: '2027-09-18T00:00:00Z', trialExpiresAt: '2026-09-19T00:00:00Z', canCancel: true };
    if (url.endsWith('/cancel-subscription')) return { message: 'Auto-renewal cancelled. Paid access remains until expiry.' };
    throw Error(url);
  });
  window.EduNex = { getUser: () => user, getAccessToken: () => 'token', authRequest: api };
  render(<ProfilePage />); fireEvent.click(screen.getByRole('button', { name: 'Subscription History' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel auto-renewal' }));
  expect(api.mock.calls.filter(([url]) => url.endsWith('/cancel-subscription'))).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
  await screen.findByText(/Auto-renewal cancelled/);
  expect(screen.getByText(/Valid until:/).textContent).toContain('2027');
  expect(screen.queryByRole('button', { name: 'Cancel auto-renewal' })).toBeNull();
  expect(api.mock.calls.filter(([url]) => url.endsWith('/cancel-subscription'))).toHaveLength(1);
});
