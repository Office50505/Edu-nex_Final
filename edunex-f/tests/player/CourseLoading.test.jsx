// @vitest-environment jsdom
import React from 'react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react';
import { VideosPage } from '../../src/pages/VideosPage';
vi.mock('../../src/lib/hlsRuntime', () => ({loadHlsJs: vi.fn().mockResolvedValue({})}));
vi.mock('../../src/legacyRuntime', () => ({ runLegacyPage: () => () => {} }));
vi.mock('../../src/hooks/usePageStyle', () => ({ usePageStyle: () => {} }));
vi.mock('../../src/components/media/CourseMediaPlayer', () => ({ CourseMediaPlayer: ({ lesson, autoplay, autoNext, mobileViewMode, onToggleMobileView }) => <div><span>Lesson player ready</span><span data-testid="active-player-lesson">{lesson.title}</span><span data-testid="player-autoplay">{String(autoplay)}</span><span data-testid="player-auto-next">{String(autoNext)}</span>{onToggleMobileView ? <button type="button" onClick={onToggleMobileView} aria-label={mobileViewMode === 'immersive' ? 'Minimize player' : 'Open fullscreen player'}>Toggle view</button> : null}</div> }));
vi.mock('../../src/components/CertificationProgress', () => ({ CertificationProgress: () => null }));
const course = { _id: 'course', title: 'Test course', videos: [{ _id: 'lesson', title: 'First lesson', provider: 'aws_cloudfront', videoUrl: 'https://cdn.example/lesson.m3u8' }] };
const reply = data => Promise.resolve({ ok: true, status: 200, json: async () => data });
beforeEach(() => {
  window.history.replaceState(null, '', '/videos?courseId=course');
  localStorage.clear(); localStorage.setItem('edunexAccessToken', 'test-token');
  delete window.EduNex;
  delete window.NexAIWidget;
  window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null }); Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: undefined }); });
it('loads the selected course when legacy scripts never become ready', async () => {
  const fetcher = vi.fn(url => reply(url.includes('subscription-status') ? { hasActiveAccess: true } : course));
  vi.stubGlobal('fetch', fetcher);
  render(<VideosPage />);
  expect(await screen.findByText('Lesson player ready')).toBeTruthy();
  expect(screen.queryByText('Preparing course')).toBeNull();
  expect(screen.getByTestId('player-auto-next').textContent).toBe('true');
  expect(fetcher.mock.calls.map(call => call[0])).toEqual(['/api/courses/course/lessons?playback=0']);
});

it('expands and collapses the complete reel lesson description', async () => {
  const longDescription = 'This is a complete lesson description with enough detail to require expansion so learners can read every important instruction without leaving the video player.';
  vi.stubGlobal('fetch', vi.fn(() => reply({
    ...course,
    videos: [{ ...course.videos[0], description: `### ${longDescription}` }],
  })));
  render(<VideosPage />);

  await screen.findByText('Lesson player ready');
  expect(screen.getAllByText(longDescription)).toHaveLength(2);
  const more = screen.getByRole('button', { name: 'More' });
  expect(more.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(more);
  expect(screen.getByRole('button', { name: 'Less' }).getAttribute('aria-expanded')).toBe('true');
  expect(document.querySelector('.reel-lesson-copy').classList.contains('is-expanded')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Less' }));
  expect(screen.getByRole('button', { name: 'More' }).getAttribute('aria-expanded')).toBe('false');
});

it('keeps auto next disabled when the user explicitly turned it off on this device', async () => {
  localStorage.setItem('edunexAutoNextVideo', 'false');
  vi.stubGlobal('fetch', vi.fn(url => reply(url.includes('subscription-status') ? { hasActiveAccess: true } : course)));
  render(<VideosPage />);
  expect((await screen.findByTestId('player-auto-next')).textContent).toBe('false');
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
  expect(screen.getByRole('button', { name: 'Open lecture notes' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Download lecture' })).toBeNull();
  const reportEvent = vi.fn();
  window.addEventListener('skillomate:open-problem-report', reportEvent, { once: true });
  fireEvent.click(screen.getByRole('button', { name: 'Report a problem' }));
  expect(reportEvent).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Open all lectures' }));
  expect(screen.getByRole('dialog', { name: 'Lectures' })).toBeTruthy();
  const firstLecture = screen.getByRole('button', { name: 'Lecture 1: Lesson 1, completed' });
  expect(firstLecture).toBeTruthy();
  expect(firstLecture.querySelector('.reel-lecture-thumb img')).toBeTruthy();
  expect(firstLecture.querySelector('.reel-lecture-number').textContent).toBe('1');
});

it('opens the selected lecture from the lecture drawer', async () => {
  const selectableCourse = {
    ...course,
    videos: [
      { ...course.videos[0], description: 'First description' },
      { ...course.videos[0], _id: 'lesson-2', title: 'Second lesson', description: 'Second description' },
    ],
  };
  vi.stubGlobal('fetch', vi.fn(() => reply(selectableCourse)));
  render(<VideosPage />);

  expect((await screen.findByTestId('active-player-lesson')).textContent).toBe('First lesson');
  fireEvent.click(screen.getByRole('button', { name: 'Open all lectures' }));
  const secondLecture = screen.getByRole('button', { name: 'Lecture 2: Second lesson' });
  const lectureGrid = secondLecture.closest('.reel-lecture-grid');
  const setPointerCapture = vi.fn();
  Object.defineProperty(lectureGrid, 'setPointerCapture', { configurable: true, value: setPointerCapture });
  fireEvent.pointerDown(secondLecture, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 120, clientY: 120 });
  fireEvent.pointerUp(secondLecture, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 120, clientY: 120 });
  expect(setPointerCapture).not.toHaveBeenCalled();
  fireEvent.click(secondLecture);

  expect(screen.queryByRole('dialog', { name: 'Lectures' })).toBeNull();
  expect((await screen.findByTestId('active-player-lesson')).textContent).toBe('Second lesson');
  expect(screen.getByTestId('player-autoplay').textContent).toBe('true');
  expect(new URL(window.location.href).searchParams.get('video')).toBe('1');
  expect(screen.getByText('Lecture 2/2')).toBeTruthy();
});

it('opens AI inside the player without navigating away from the lecture', async () => {
  const open = vi.fn();
  window.NexAIWidget = { open };
  vi.stubGlobal('fetch', vi.fn(() => reply(course)));

  render(<VideosPage />);

  expect(await screen.findByText('Lesson player ready')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Open AI chat for this lecture' }));
  expect(open).toHaveBeenCalledWith(document.getElementById('playerFrame'));
  expect(window.location.pathname).toBe('/videos');
  expect(screen.getByText('Lesson player ready')).toBeTruthy();
});

it('shares only the offer-page URL from the player action', async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'share', { configurable: true, value: share });
  vi.stubGlobal('fetch', vi.fn(() => reply(course)));
  render(<VideosPage />);
  expect(await screen.findByText('Lesson player ready')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Share Skillomate offer' }));

  await waitFor(() => expect(share).toHaveBeenCalledOnce());
  expect(share.mock.calls[0][0]).toEqual({
    title: 'Skillomate special offer',
    text: 'Start your Skillomate learning journey with this special offer.',
    url: `${window.location.origin}/offer`,
  });
  expect(share.mock.calls[0][0].url).not.toContain('/videos');
  expect(screen.getByText('Shared')).toBeTruthy();
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
});

it('copies the offer-page URL when native sharing is unavailable', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  vi.stubGlobal('fetch', vi.fn(() => reply(course)));
  render(<VideosPage />);
  expect(await screen.findByText('Lesson player ready')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Share Skillomate offer' }));

  await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/offer`));
  expect(screen.getByText('Link copied')).toBeTruthy();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
});

it('changes lecture ranges with horizontal swipe and trackpad scroll while keeping range buttons', async () => {
  const pagedCourse = {
    ...course,
    videos: Array.from({ length: 34 }, (_, index) => ({
      _id: `lecture-${index + 1}`,
      title: `Lecture title ${index + 1}`,
      provider: 'aws_cloudfront',
      videoUrl: `https://cdn.example/lecture-${index + 1}.m3u8`,
    })),
  };
  vi.stubGlobal('fetch', vi.fn(() => reply(pagedCourse)));
  render(<VideosPage />);
  expect(await screen.findByText('Lesson player ready')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Open all lectures' }));

  expect(screen.getByRole('tab', { name: '1–20' }).getAttribute('aria-selected')).toBe('true');
  let grid = screen.getByLabelText('Lectures 1 to 20. Swipe left or right to change range.');
  fireEvent.pointerDown(grid, { pointerId: 1, pointerType: 'touch', clientX: 320, clientY: 180 });
  fireEvent.pointerUp(grid, { pointerId: 1, pointerType: 'touch', clientX: 80, clientY: 184 });

  expect(screen.getByRole('tab', { name: '21–34' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.getByRole('button', { name: 'Lecture 21: Lecture title 21' })).toBeTruthy();
  grid = screen.getByLabelText('Lectures 21 to 34. Swipe left or right to change range.');
  fireEvent.wheel(grid, { deltaX: 0, deltaY: -120 });

  expect(screen.getByRole('tab', { name: '1–20' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.getByRole('button', { name: 'Lecture 1: Lecture title 1' })).toBeTruthy();

  fireEvent.click(screen.getByRole('tab', { name: '21–34' }));
  grid = screen.getByLabelText('Lectures 21 to 34. Swipe left or right to change range.');
  fireEvent.pointerDown(grid, { pointerId: 2, pointerType: 'mouse', button: 0, clientX: 260, clientY: 150 });
  fireEvent.pointerMove(grid, { pointerId: 2, pointerType: 'mouse', buttons: 1, clientX: 330, clientY: 152 });
  expect(screen.getByRole('tab', { name: '1–20' }).getAttribute('aria-selected')).toBe('true');
});

it('mounts notes and lectures inside the fullscreen player frame', async () => {
  vi.stubGlobal('fetch', vi.fn(() => reply(course)));
  render(<VideosPage />);
  expect(await screen.findByText('Lesson player ready')).toBeTruthy();
  const playerFrame = document.getElementById('playerFrame');
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: playerFrame });

  const openNotesButton = screen.getByRole('button', { name: 'Open lecture notes' });
  fireEvent.click(openNotesButton);
  expect(document.getElementById('courseNotesModal').parentElement).toBe(playerFrame);
  const notesBack = screen.getByRole('button', { name: 'Back to video' });
  expect(document.activeElement).toBe(notesBack);
  fireEvent.click(notesBack);
  expect(document.getElementById('courseNotesModal')).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(openNotesButton));

  fireEvent.click(openNotesButton);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(document.getElementById('courseNotesModal')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Open all lectures' }));
  expect(document.querySelector('.reel-lecture-backdrop').parentElement).toBe(playerFrame);
});

it('uses the desktop back arrow to exit fullscreen before leaving the course', async () => {
  vi.stubGlobal('fetch', vi.fn(() => reply(course)));
  render(<VideosPage />);
  expect(await screen.findByText('Lesson player ready')).toBeTruthy();
  const playerFrame = document.getElementById('playerFrame');
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: playerFrame });
  const exitFullscreen = vi.fn().mockImplementation(() => {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    return Promise.resolve();
  });
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exitFullscreen });

  fireEvent.click(screen.getByRole('link', { name: 'Back to courses or minimize fullscreen player' }));

  expect(exitFullscreen).toHaveBeenCalledOnce();
  expect(window.location.pathname).toBe('/videos');
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

  const { container, unmount } = render(<VideosPage />);
  expect((await screen.findByTestId('active-player-lesson')).textContent).toBe('First lesson');
  expect(window.SkillomateLessonContext).toEqual({ courseId: 'course', lessonId: 'lesson' });
  expect(document.body.classList.contains('has-edunex-mobile-reel')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Minimize player' }));
  expect(document.body.classList.contains('has-edunex-mobile-reel')).toBe(false);
  expect(container.querySelector('.react-page-root').classList.contains('is-mobile-player-minimized')).toBe(true);
  expect(screen.getByRole('button', { name: 'Open fullscreen player' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Open fullscreen player' }));
  expect(document.body.classList.contains('has-edunex-mobile-reel')).toBe(true);
  expect(container.querySelector('.react-page-root').classList.contains('is-mobile-player-minimized')).toBe(false);
  fireEvent.wheel(container.querySelector('#playerFrame'), { deltaY: 80, deltaX: 0 });
  expect((await screen.findByTestId('active-player-lesson')).textContent).toBe('Second lesson');
  expect(window.SkillomateLessonContext).toEqual({ courseId: 'course', lessonId: 'lesson-2' });
  unmount();
  expect(window.SkillomateLessonContext).toBeUndefined();
});

it('changes the Notes content when scrolling to a different lecture', async () => {
  window.history.replaceState(null, '', '/videos?courseId=course&video=0');
  window.matchMedia = vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const notesCourse = {
    ...course,
    videos: [
      { ...course.videos[0], notes: 'Notes for lecture one' },
      { ...course.videos[0], _id: 'lesson-2', title: 'Second lesson', notes: 'Notes for lecture two' },
    ],
  };
  window.EduNex = { authRequest: vi.fn().mockResolvedValue({ courseId: 'course', lessons: [] }) };
  vi.stubGlobal('fetch', vi.fn(() => reply(notesCourse)));

  const { container } = render(<VideosPage />);
  expect((await screen.findByTestId('active-player-lesson')).textContent).toBe('First lesson');
  fireEvent.click(screen.getByRole('button', { name: 'Open lecture notes' }));
  expect(screen.getByText('Notes for lecture one')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Back to video' }));

  fireEvent.wheel(container.querySelector('#playerFrame'), { deltaY: 80, deltaX: 0 });
  expect((await screen.findByTestId('active-player-lesson')).textContent).toBe('Second lesson');
  fireEvent.click(screen.getByRole('button', { name: 'Open lecture notes' }));
  expect(screen.getByText('Notes for lecture two')).toBeTruthy();
});
