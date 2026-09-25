// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { route } from '../../src/lib/routes.js';
import { AdOfferPage } from '../../src/pages/AdOfferPage.jsx';
import { DEFAULT_OFFER_VIDEO_URL, OFFER_MEDIA } from '../../src/lib/offerMedia.js';

beforeEach(() => {
  sessionStorage.clear();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    mode: 'test', gateway: 'razorpay', trialAmountPaise: 100,
    subscriptionAmountPaise: 49900, trialHours: 24,
    metaPixel: { enabled: false },
  }), { headers: { 'Content-Type': 'application/json' } })));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

it.each(Object.entries(OFFER_MEDIA))('%s renders its video, falls back on media failure, and opens phone verification', async (page, media) => {
  window.history.replaceState({}, '', route(page));
  render(<AdOfferPage />);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(screen.getByRole('heading', { name: 'Skillomate Subscription' })).toBeTruthy();
  const video = document.querySelector('video');
  expect(video.getAttribute('src')).toBe(media.videoUrl);
  fireEvent.error(video);
  expect(video.getAttribute('src')).toBe(DEFAULT_OFFER_VIDEO_URL);
  fireEvent.click(screen.getByRole('button', { name: /Subscribe for ₹1/i }));
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.getByLabelText('Mobile number')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Login / Sign up' })).toBeTruthy();
  expect(fetch.mock.calls.every(([, options]) => !options?.method || options.method === 'GET')).toBe(true);
});
