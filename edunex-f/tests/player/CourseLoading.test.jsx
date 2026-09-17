// @vitest-environment jsdom
import React from 'react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { VideosPage } from '../../src/pages/VideosPage';
vi.mock('../../src/lib/hlsRuntime', () => ({loadHlsJs: vi.fn().mockResolvedValue({})}));
vi.mock('../../src/legacyRuntime', () => ({ runLegacyPage: () => () => {} }));
vi.mock('../../src/hooks/usePageStyle', () => ({ usePageStyle: () => {} }));
vi.mock('../../src/components/media/CourseMediaPlayer', () => ({ CourseMediaPlayer: () => <div>Lesson player ready</div> }));
vi.mock('../../src/components/CertificationProgress', () => ({ CertificationProgress: () => null }));
const course = { _id: 'course', title: 'Test course', videos: [{ _id: 'lesson', title: 'First lesson', provider: 'aws_cloudfront', videoUrl: 'https://cdn.example/lesson.m3u8' }] };
const reply = data => Promise.resolve({ ok: true, status: 200, json: async () => data });
beforeEach(() => {
  window.history.replaceState(null, '', '/videos?courseId=course');
  localStorage.clear(); localStorage.setItem('edunexAccessToken', 'test-token');
  delete window.EduNex;
  window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('loads the selected course when legacy scripts never become ready', async () => {
  const fetcher = vi.fn(url => reply(url.includes('subscription-status') ? { hasActiveAccess: true } : course));
  vi.stubGlobal('fetch', fetcher);
  render(<VideosPage />);
  expect(await screen.findByText('Lesson player ready')).toBeTruthy();
  expect(screen.queryByText('Preparing course')).toBeNull();
  expect(fetcher.mock.calls.map(call => call[0])).toEqual(['/api/courses/course/lessons?playback=0']);
});
it('shows a timeout and Retry recovers without reloading the page', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn((url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))));
  render(<VideosPage />);
  await act(async () => { await vi.advanceTimersByTimeAsync(15001); });
  expect(screen.getAllByText(/took too long/).length).toBeGreaterThan(0);
  vi.stubGlobal('fetch', vi.fn(url => reply(url.includes('subscription-status') ? { hasActiveAccess: true } : course)));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry loading course' })); });
  expect(screen.getByText('Lesson player ready')).toBeTruthy();
});
it('failed access verification shows an error instead of treating it as unpaid', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
  render(<VideosPage />);
  expect((await screen.findAllByText(/Could not load the course playlist/)).length).toBeGreaterThan(0);
  expect(window.location.pathname).toBe('/videos');
});
