// @vitest-environment jsdom
import React from 'react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { VideosPage } from '../../src/pages/VideosPage';
vi.mock('../../src/lib/hlsRuntime', () => ({loadHlsJs: vi.fn().mockResolvedValue({})}));
vi.mock('../../src/legacyRuntime', () => ({ runLegacyPage: () => () => {} }));
vi.mock('../../src/hooks/usePageStyle', () => ({ usePageStyle: () => {} }));
vi.mock('../../src/components/media/CourseMediaPlayer', () => ({ CourseMediaPlayer: ({ lesson, autoplay, mobileViewMode, onToggleMobileView }) => <div><span>Lesson player ready</span><span data-testid="active-player-lesson">{lesson.title}</span><span data-testid="player-autoplay">{String(autoplay)}</span>{onToggleMobileView ? <button type="button" onClick={onToggleMobileView} aria-label={mobileViewMode === 'immersive' ? 'Minimize player' : 'Open fullscreen player'}>Toggle view</button> : null}</div> }));
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

it('resumes at the first unfinished lecture and exposes the mobile lecture drawer', async () => {
  const resumeCourse = {
    ...course,
    videos: Array.from({ length: 4 }, (_, index) => ({
      _id: `lesson-${index + 1}`,
      title: `Lesson ${index + 1}`,
      provider: 'aws_cloudfront',
      videoUrl: `https://cdn.example/lesson-${index + 1}.m3u8`,
    })),
  };
  window.EduNex = {
    authRequest: vi.fn().mockResolvedValue({
      courseId: 'course',
      completedLessons: 3,
      totalLessons: 4,
      progressPercent: 75,
      lessons: resumeCourse.videos.map((lesson, index) => ({ id: lesson._id, complete: index < 3 })),
    }),
  };
  vi.stubGlobal('fetch', vi.fn(() => reply(resumeCourse)));

  render(<VideosPage />);

  expect((await screen.findByTestId('active-player-lesson')).textContent).toBe('Lesson 4');
  expect(screen.getByTestId('player-autoplay').textContent).toBe('true');
  expect(screen.getByText('Lecture 4/4')).toBeTruthy();
  expect(new URL(window.location.href).searchParams.get('video')).toBe('3');
  expect(document.querySelector('#course-playlist').hidden).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Lectures' }));
  expect(screen.getByRole('dialog', { name: 'Course lectures' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Close course lectures' }));
  expect(document.querySelector('#course-playlist').hidden).toBe(true);
  expect(screen.getByRole('button', { name: 'Open course notes' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Download lecture' })).toBeNull();
  const reportEvent = vi.fn();
  window.addEventListener('skillomate:open-problem-report', reportEvent, { once: true });
  fireEvent.click(screen.getByRole('button', { name: 'Report a problem' }));
  expect(reportEvent).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Open all lectures' }));
  expect(screen.getByRole('dialog', { name: 'Lectures' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Lecture 1: Lesson 1, completed' })).toBeTruthy();
});

it('keeps an explicitly selected lecture instead of replacing it with resume progress', async () => {
  window.history.replaceState(null, '', '/videos?courseId=course&video=0');
  const twoLessons = {
    ...course,
    videos: [course.videos[0], { ...course.videos[0], _id: 'lesson-2', title: 'Second lesson' }],
  };
  window.EduNex = {
    authRequest: vi.fn().mockResolvedValue({
      courseId: 'course',
      completedLessons: 1,
      totalLessons: 2,
      lessons: [{ id: 'lesson', complete: true }, { id: 'lesson-2', complete: false }],
    }),
  };
  vi.stubGlobal('fetch', vi.fn(() => reply(twoLessons)));

  render(<VideosPage />);

  expect((await screen.findByTestId('active-player-lesson')).textContent).toBe('First lesson');
  expect(screen.getByText('Lecture 1/2')).toBeTruthy();
});

it('moves to the next lecture when the mobile player is scrolled', async () => {
  window.history.replaceState(null, '', '/videos?courseId=course&video=0');
  window.matchMedia = vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const twoLessons = {
    ...course,
    videos: [course.videos[0], { ...course.videos[0], _id: 'lesson-2', title: 'Second lesson' }],
  };
  window.EduNex = {
    authRequest: vi.fn().mockResolvedValue({ courseId: 'course', lessons: [] }),
  };
  vi.stubGlobal('fetch', vi.fn(() => reply(twoLessons)));

  const { container } = render(<VideosPage />);
  expect((await screen.findByTestId('active-player-lesson')).textContent).toBe('First lesson');
  expect(document.body.classList.contains('has-edunex-mobile-reel')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Minimize player' }));
  expect(document.body.classList.contains('has-edunex-mobile-reel')).toBe(false);
  expect(screen.getByRole('button', { name: 'Open fullscreen player' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Open fullscreen player' }));
  expect(document.body.classList.contains('has-edunex-mobile-reel')).toBe(true);
  fireEvent.wheel(container.querySelector('#playerFrame'), { deltaY: 80, deltaX: 0 });
  expect((await screen.findByTestId('active-player-lesson')).textContent).toBe('Second lesson');
});
