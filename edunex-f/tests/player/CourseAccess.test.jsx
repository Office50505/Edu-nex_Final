// @vitest-environment jsdom
import React from 'react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { VideosPage } from '../../src/pages/VideosPage.jsx';
import { PageErrorBoundary } from '../../src/components/PageErrorBoundary.jsx';
vi.mock('../../src/legacyRuntime.js', () => ({ runLegacyPage: () => () => {} }));
vi.mock('../../src/hooks/usePageStyle.js', () => ({ usePageStyle: () => {} }));
vi.mock('../../src/lib/hlsRuntime.js', () => ({ loadHlsJs: async () => ({}) }));
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('edunexAccessToken', 'test-token');
  window.history.replaceState(null, '', '/videos?courseId=course-1&video=2');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function respond(status, data) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ status, ok: status === 200, json: async () => data })));
}
it.each(['no_subscription', 'subscription_expired'])('shows a subscription prompt for %s and preserves the selected lesson', async (error) => {
  respond(403, { error });
  render(<VideosPage />);
  expect(await screen.findByRole('heading', { name: 'Subscribe to continue' })).toBeTruthy();
  expect(window.location.pathname).toBe('/videos');
  const target = new URL(screen.getByRole('link', { name: 'View subscription plans' }).href);
  expect(target.pathname).toBe('/payment');
  expect(target.searchParams.get('next')).toBe('/videos?courseId=course-1&video=2');
  expect(screen.getByRole('link', { name: 'Back to courses' }).getAttribute('href')).toBe('/courses');
  expect(screen.getByRole('main').classList.contains('react-page-root')).toBe(true);
  expect(screen.getByRole('main').getAttribute('data-page')).toBe('videos.html');
  expect(document.querySelector('video')).toBeNull();
});
it('releases the mobile player scroll lock when subscription access is required', async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  document.body.classList.add('has-edunex-player-fullscreen');
  respond(403, { error: 'no_subscription' });

  render(<VideosPage />);

  expect(await screen.findByRole('heading', { name: 'Subscribe to continue' })).toBeTruthy();
  expect(document.body.classList.contains('has-edunex-mobile-reel')).toBe(false);
  expect(document.body.classList.contains('has-edunex-player-fullscreen')).toBe(false);
});
it('does not sell a subscription for an unrelated forbidden response', async () => {
  respond(403, { error: 'Course is not published' });
  render(<VideosPage />);
  expect(await screen.findByText('Could not open this course')).toBeTruthy();
  expect(screen.queryByText('Subscribe to continue')).toBeNull();
});
it('keeps server errors visible with a retry control', async () => {
  respond(500, {});
  render(<VideosPage />);
  expect(await screen.findByRole('button', { name: 'Retry loading course' })).toBeTruthy();
});
it('shows recovery controls instead of unmounting the whole app on a page crash', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  function BrokenPage() { throw new Error('simulated page crash'); }
  render(<><header>Skillomate navigation</header><PageErrorBoundary><BrokenPage /></PageErrorBoundary></>);
  expect(screen.getByText('Skillomate navigation')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Reload page' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Back to courses' })).toBeTruthy();
});
