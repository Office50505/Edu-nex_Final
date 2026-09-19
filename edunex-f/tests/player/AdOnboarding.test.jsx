// @vitest-environment jsdom
import React from 'react';
import { afterEach, it, expect, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { SignupPage } from '../../src/pages/SignupPage.jsx';
vi.mock('../../src/legacyRuntime.js', () => ({ runLegacyPage: () => () => {} }));
vi.mock('../../src/hooks/usePageStyle.js', () => ({ usePageStyle: () => {} }));
afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear(); delete window.EduNex; vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('resumes paid phone verification directly into profile details without sending OTP', async () => {
  window.history.replaceState(null, '', '/signup#onboarding='+'a'.repeat(64));
  window.matchMedia=vi.fn(()=>({matches:false,addEventListener(){},removeEventListener(){}}));
  window.EduNex={request:vi.fn(async path=>{
    expect(path).toBe('/api/onboarding/resume');
    return {mobileNumber:'919999999999',signupToken:'scoped-completion-token'};
  })};
  render(<SignupPage />);
  expect(await screen.findByPlaceholderText('e.g. Alex Rivers')).toBeTruthy();
  expect(window.location.hash).toBe('');
  expect(window.EduNex.request).toHaveBeenCalledOnce();
  expect(JSON.parse(sessionStorage.getItem('skillomateAdProfile')).mobileNumber).toBe('919999999999');
});
it('keeps a failed handoff out of the profile screen', async () => {
  window.history.replaceState(null, '', '/signup#onboarding='+'b'.repeat(64));
  window.EduNex={request:vi.fn(async()=>{throw new Error('Return link expired');})};
  render(<SignupPage />);
  expect(await screen.findByText('Return link expired')).toBeTruthy();
  expect(document.querySelector('#step3').classList.contains('active')).toBe(false);
});
