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
vi.mock('../../src/lib/razorpayCheckout.js', () => ({ openRazorpay: vi.fn(async () => ({ razorpay_subscription_id: 'sub_annual' })) }));
const pricing = { annualAmountPaise: 499900, subscriptionAmountPaise: 49900, trialAmountPaise: 100, trialHours: 24, annualAvailable: true };
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) });
function mockApi(config = pricing, eligible = true) {
  const fetcher = vi.fn(async (url, options) => {
    if (url.endsWith('/config')) return response(config);
    if (url.endsWith('/subscription-status')) return response({ status: 'none', trialEligible: eligible });
    if (url.endsWith('/initiate-trial')) return response({ gateway: 'razorpay', subscriptionId: 'sub_annual', paymentType: JSON.parse(options.body).paymentType });
    if (url.endsWith('/razorpay/verify')) return response({ accessGranted: true });
    throw Error('Unexpected URL ' + url);
  });
  vi.stubGlobal('fetch', fetcher); return fetcher;
}
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('edunexAccessToken', 'token'); window.history.replaceState(null, '', '/payment?plan=annual'); vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete window.EduNex; });
it('annual pricing card opens annual checkout', () => {
  render(<PricingPage />);
  expect(screen.getByRole('link', { name: /Continue to checkout/ }).getAttribute('href')).toBe('/payment?plan=annual');
});
it('annual checkout works for a used-trial account with annual disclosure and verified access', async () => {
  const fetcher = mockApi(pricing, false); render(<PaymentPage />);
  const button = await screen.findByRole('button', { name: /Subscribe for ₹4,999(?:\.00)?\/year/ });
  expect(button.disabled).toBe(false); expect(screen.getByText(/No trial charge applies/)).toBeTruthy();
  fireEvent.click(button);
  await screen.findByText("You're already subscribed!");
  expect(JSON.parse(fetcher.mock.calls.find(([url]) => url.endsWith('/initiate-trial'))[1].body)).toEqual({ paymentType: 'annual', mandateConsent: true });
  expect(openRazorpay).toHaveBeenCalledTimes(1);
});
it('unconfigured annual checkout cannot silently charge the monthly plan', async () => {
  const fetcher = mockApi({ ...pricing, annualAvailable: false }); render(<PaymentPage />);
  expect((await screen.findByRole('button', { name: /Subscribe for/ })).disabled).toBe(true);
  expect(screen.getByRole('alert').textContent).toContain('Yearly checkout is currently unavailable');
  expect(fetcher.mock.calls.some(([url]) => url.endsWith('/initiate-trial'))).toBe(false);
});
it('monthly selection preserves the trial and updates the login continuation URL', async () => {
  localStorage.clear(); mockApi(); render(<PaymentPage />);
  await screen.findByRole('link', { name: /Log In to Continue/ });
  expect(screen.getByRole('link', { name: /Log In to Continue/ }).getAttribute('href')).toContain('plan%3Dannual');
  fireEvent.click(screen.getByRole('radio', { name: 'Monthly' }));
  expect(screen.getByRole('link', { name: /Log In to Continue/ }).getAttribute('href')).toContain('plan%3Dmonthly');
});
it('default checkout still sends trial payment type', async () => {
  window.history.replaceState(null, '', '/payment'); const fetcher = mockApi(); render(<PaymentPage />);
  fireEvent.click(await screen.findByRole('button', { name: /Try 24 Hours/ }));
  await waitFor(() => expect(openRazorpay).toHaveBeenCalledTimes(1));
  expect(JSON.parse(fetcher.mock.calls.find(([url]) => url.endsWith('/initiate-trial'))[1].body).paymentType).toBe('trial');
});

it('annual renewal cancellation requires confirmation and keeps the paid expiry visible', async () => {
  const user = { _id: 'u1', fullName: 'Learner', subscriptionStatus: 'active' };
  localStorage.setItem('edunexUser', JSON.stringify(user));
  const api = vi.fn(async (url) => {
    if (url === '/api/auth/me') return { user };
    if (url.endsWith('/subscription-status')) return { status: 'active', subscriptionType: 'annual', currentPeriodEnd: '2027-09-18T00:00:00Z', trialExpiresAt: '2026-09-19T00:00:00Z', canCancel: true };
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
