// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CertificationProgress } from '../../src/components/CertificationProgress';

beforeEach(() => {
  window.EduNex = {
    authRequest: vi.fn().mockResolvedValue({
      courseId: 'course-1',
      completedLessons: 0,
      totalLessons: 34,
      progressPercent: 36,
      requirements: ['Watch at least 90% of every lesson.'],
      lessons: [{ id: 'lesson-1', complete: false }],
      assessmentRequired: false,
      eligible: false,
    }),
  };
});

afterEach(() => {
  cleanup();
  delete window.EduNex;
});

it('shows watched-time progress before the first lesson is complete', async () => {
  render(<CertificationProgress courseId="course-1" />);

  expect(await screen.findByText('36% complete')).toBeTruthy();
  expect(screen.getByText('0 of 34 lessons completed')).toBeTruthy();
  expect(screen.getByRole('progressbar').value).toBe(36);
});
