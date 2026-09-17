// @vitest-environment jsdom
import React from 'react';
import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { LoginPage } from '../../src/pages/LoginPage.jsx';
vi.mock('../../src/legacyRuntime.js', () => ({ runLegacyPage: () => () => {} }));
vi.mock('../../src/hooks/usePageStyle.js', () => ({ usePageStyle: () => {} }));
afterEach(() => { cleanup(); delete window.EduNex; vi.restoreAllMocks(); });
function open(request = vi.fn().mockResolvedValue({})) {
  window.EduNex = { request };
  render(<LoginPage />);
  fireEvent.change(screen.getByLabelText('Mobile Number'), { target: { value: '9876543210' } });
  fireEvent.click(screen.getByRole('button', { name: 'Forgot?' }));
  return request;
}
async function send() {
  fireEvent.click(screen.getByRole('button', { name: 'Send reset code' }));
  await screen.findByLabelText('SMS code');
}
function fill(confirmation = 'new-password') {
  fireEvent.change(screen.getByLabelText('SMS code'), { target: { value: '012345' } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-password' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirmation } });
}
it('connects Forgot to OTP recovery and returns to sign-in after confirmed reset', async () => {
  const request = open();
  expect(screen.getByLabelText('Mobile Number').value).toBe('9876543210');
  await send();
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ mobileNumber: '919876543210' });
  expect(request.mock.calls[0][0]).toBe('/api/auth/password-reset/request');
  expect(screen.getByRole('button', { name: /Resend code in/ }).disabled).toBe(true);
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
  await screen.findByText('Password updated. Sign in with your new password.');
  expect(request.mock.calls[1][0]).toBe('/api/auth/password-reset/confirm');
  expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({ mobileNumber: '919876543210', otp: '012345', newPassword: 'new-password' });
  expect(screen.getByLabelText('Password').value).toBe('');
});
it('does not submit mismatched passwords and preserves the form for an invalid OTP', async () => {
  const request = open(vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Invalid OTP')));
  await send(); fill('different');
  fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
  expect(screen.getByRole('alert').textContent).toBe('Passwords do not match.');
  expect(request).toHaveBeenCalledTimes(1);
  fill(); fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
  await screen.findByText('Invalid OTP');
  expect(screen.getByLabelText('SMS code')).toBeTruthy();
});
it('shows delivery errors, allows retry and clears code on change number', async () => {
  const request = open(vi.fn().mockRejectedValueOnce(new Error('Please wait 60 seconds')).mockResolvedValue({}));
  fireEvent.click(screen.getByRole('button', { name: 'Send reset code' }));
  await screen.findByText('Please wait 60 seconds');
  await send(); fill();
  fireEvent.click(screen.getByRole('button', { name: 'Change number' }));
  expect(screen.queryByLabelText('SMS code')).toBeNull();
  expect(screen.getByLabelText('Mobile Number').disabled).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Sign In' })).toBeTruthy());
  expect(request).toHaveBeenCalledTimes(2);
});
