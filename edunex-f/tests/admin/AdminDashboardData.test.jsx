// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AdminDashboardPage } from '../../src/pages/admin/AdminDashboardPage.jsx';
import { adminJson } from '../../src/pages/admin/adminApi.js';

vi.mock('../../src/pages/admin/adminApi.js', async (importOriginal) => ({
  ...await importOriginal(), adminJson: vi.fn(), requireAdmin: () => true,
}));
beforeEach(() => {
  adminJson.mockReset();
  localStorage.clear();
});
afterEach(cleanup);

it.each([0, 3])('shows %s open reports from the reports endpoint and removes global search', async (count) => {
  adminJson.mockImplementation(async path => {
    if (path.startsWith('/api/admin/problem-reports')) return { counts: { new: count, in_progress: 0, resolved: 9 } };
    if (path.startsWith('/api/admin/certifications')) return { total: 0, progress: [] };
    if (path.startsWith('/api/admin/system-health')) return { checks: [], summary: {} };
    return { totals: {}, learning: {}, breakdowns: {}, dailySeries: [] };
  });
  render(<AdminDashboardPage />);
  expect(await screen.findByText(`${count} open learner issues`)).toBeTruthy();
  expect(screen.queryByPlaceholderText('Search learners, courses, payments...')).toBeNull();
});

it('shows unavailable rather than zero when report counts fail', async () => {
  adminJson.mockImplementation(async path => {
    if (path.startsWith('/api/admin/problem-reports')) throw new Error('Offline');
    return { totals: {}, learning: {}, breakdowns: {}, dailySeries: [] };
  });
  render(<AdminDashboardPage />);
  expect(await screen.findByText('Report count unavailable')).toBeTruthy();
});
