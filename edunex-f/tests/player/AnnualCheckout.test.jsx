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
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('edunexAccessToken', 'token'); window.history.replaceState(null, '', '/payment?plan=annual'); vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete window.EduNex; });
it('pricing page only offers the monthly subscription', () => {
  render(<PricingPage />);
  expect(screen.getByRole('heading', { name: 'Monthly subscription' })).toBeTruthy();
  expect(screen.queryByText(/annual|yearly|4,999/i)).toBeNull();
  expect(screen.getAllByRole('link', { name: /Continue with UPI/ })).toHaveLength(2);
});
it('legacy annual checkout links fall back to monthly Razorpay checkout', async () => {
  const fetcher = mockApi(pricing, false); render(<PaymentPage />);
  await screen.findByText("Payment Successful");
  expect(JSON.parse(fetcher.mock.calls.find(([url]) => url.endsWith('/initiate-trial'))[1].body)).toEqual({ paymentType: 'monthly', mandateConsent: true });
  expect(window.location.search).toBe('?plan=monthly');
  expect(openRazorpay).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Choose your billing plan')).toBeNull();
});
it('legacy yearly checkout links also fall back to monthly', async () => {
  window.history.replaceState(null, '', '/payment?plan=yearly');
  const fetcher = mockApi(); render(<PaymentPage />);
  await screen.findByText('Payment Successful');
  expect(JSON.parse(fetcher.mock.calls.find(([url]) => url.endsWith('/initiate-trial'))[1].body).paymentType).toBe('monthly');
  expect(window.location.search).toBe('?plan=monthly');
});
it('login continuation replaces a retired annual plan with monthly', async () => {
  localStorage.clear(); mockApi(); render(<PaymentPage />);
  await screen.findByRole('link', { name: 'Log In' });
  expect(screen.getByRole('link', { name: 'Log In' }).getAttribute('href')).toContain('plan%3Dmonthly');
  expect(screen.getByRole('link', { name: 'Log In' }).getAttribute('href')).not.toContain('annual');
  expect(screen.queryByRole('radio')).toBeNull();
});
it('default checkout opens the eligible trial directly', async () => {
  window.history.replaceState(null, '', '/payment'); const fetcher = mockApi(); render(<PaymentPage />);
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

it('never navigates to a legacy payment URL', async () => {
  const fetcher = mockApi();
  fetcher.mockImplementation(async (url) => {
    if (url.endsWith('/config')) return response(pricing);
    if (url.endsWith('/subscription-status')) return response({ accessGranted: false });
    return response({ gateway: 'phonepe', redirectUrl: 'https://example.test/pay' });
  });
  render(<PaymentPage />);
  await screen.findByText('Secure checkout is unavailable. Please try again later.');
  expect(window.location.pathname).toBe('/payment');
  expect(openRazorpay).not.toHaveBeenCalled();
  expect(localStorage.getItem('edunexHasCourseAccess')).toBeNull();
});
it('keeps provider failures on the paywall with a retry action', async () => {
  mockApi(); openRazorpay.mockRejectedValueOnce(new Error('Payment failed.'));
  render(<PaymentPage />);
  await screen.findByText('Payment failed.');
  expect(screen.getByRole('button', { name: 'Try Razorpay Again' })).toBeTruthy();
  expect(localStorage.getItem('edunexHasCourseAccess')).toBeNull();
});
it('does not grant access or start another payment when verification is unavailable', async () => {
  const fetcher = mockApi();
  const initial = fetcher.getMockImplementation();
  fetcher.mockImplementation((url, options) => url.endsWith('/razorpay/verify')
    ? Promise.resolve(response({ error: 'Confirmation delayed' }, 503)) : initial(url, options));
  render(<PaymentPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Check payment status' }));
  await screen.findByText(/Still waiting for payment confirmation/);
  expect(openRazorpay).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem('edunexHasCourseAccess')).toBeNull();
  expect(screen.queryByText('Payment Successful')).toBeNull();
});
it('explicit trial links retain the advertised one-rupee offer', async () => {
  window.history.replaceState(null, '', '/payment?plan=trial');
  const fetcher = mockApi(); render(<PaymentPage />);
  await screen.findByText('Payment Successful');
  expect(JSON.parse(fetcher.mock.calls.find(([url]) => url.endsWith('/initiate-trial'))[1].body).paymentType).toBe('trial');
});

it('opens monthly checkout directly for a trial-used account', async () => {
 window.history.replaceState(null, '', '/payment'); const fetcher = mockApi(pricing, false); render(<PaymentPage />);
 await waitFor(() => expect(openRazorpay).toHaveBeenCalledTimes(1));
 expect(JSON.parse(fetcher.mock.calls.find(([url]) => url.endsWith('/initiate-trial'))[1].body).paymentType).toBe('monthly');
});
it('blocks purchasing when eligibility could not be checked', async () => {
 const fetcher = mockApi(); const original = fetcher.getMockImplementation();
 fetcher.mockImplementation((url, options) => url.endsWith('/subscription-status') ? Promise.resolve(response({error:'Status unavailable'}, 503)) : original(url, options));
 render(<PaymentPage />);
 await screen.findByRole('heading', {name:'Could not check your subscription'});
 expect(openRazorpay).not.toHaveBeenCalled();
 expect(screen.queryByRole('button', { name: /Pay ₹/ })).toBeNull();
});
