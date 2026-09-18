// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AdminReportsPage } from '../../src/pages/admin/AdminReportsPage.jsx';

const report = {
  _id: '507f1f77bcf86cd799439011', reference: 'RPT-20260918-99439011',
  message: 'The lesson video stays blank on my phone.', category: 'video', status: 'new',
  reporterName: 'Test Learner', reporterEmail: 'learner@example.test',
  route: '/videos', deviceType: 'mobile', viewport: { width: 390, height: 844 },
  createdAt: '2026-09-18T10:00:00Z', adminNote: '',
};
const response = (data, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => data });
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  sessionStorage.setItem('edunexAdminToken', 'test-admin-token');
  window.history.replaceState(null, '', '/admin/reports');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('loads learner reports with admin authentication and saves resolution notes', async () => {
  const fetchMock = vi.fn(async (_path, options) => options.method === 'PATCH'
    ? response({ report: { ...report, ...JSON.parse(options.body) } })
    : response({ reports: [report], counts: { new: 1 }, total: 1, pages: 1 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<AdminReportsPage />);
  const card = (await screen.findByText(report.message)).closest('article');
  expect(within(card).getByText(report.reporterEmail)).toBeTruthy();
  expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/problem-reports?page=1&limit=20');
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-admin-token');
  fireEvent.change(within(card).getByLabelText('Status'), { target: { value: 'resolved' } });
  fireEvent.change(within(card).getByLabelText('Private admin note'), { target: { value: 'Corrected video source.' } });
  fireEvent.click(within(card).getByRole('button', { name: 'Save update' }));
  await screen.findByText(`${report.reference} updated.`);
  const [path, options] = fetchMock.mock.calls.find(([, options]) => options.method === 'PATCH');
  expect(path).toBe(`/api/admin/problem-reports/${report._id}`);
  expect(JSON.parse(options.body)).toEqual({ status: 'resolved', adminNote: 'Corrected video source.' });
});

it('shows newly submitted reports when the admin refreshes the list', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(response({ reports: [], counts: {}, total: 0, pages: 1 }))
    .mockResolvedValueOnce(response({ reports: [report], counts: { new: 1 }, total: 1, pages: 1 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<AdminReportsPage />);
  await screen.findByText('No reports found');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await screen.findByText(report.message);
  expect(screen.getByText('1 matching report')).toBeTruthy();
});

it('shows a loading failure instead of claiming reports were loaded', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => response({ error: 'Unable to load problem reports.' }, false)));
  render(<AdminReportsPage />);
  expect((await screen.findByRole('alert')).textContent).toContain('Unable to load problem reports.');
});
