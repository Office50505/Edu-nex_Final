// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AdOfferPage } from "../../src/pages/AdOfferPage.jsx";
import { pageKeyFromPath, route } from "../../src/lib/routes.js";
import { hasReactPage } from "../../src/lib/pageLoaders.jsx";
import { DEFAULT_OFFER_VIDEO_URL, OFFER_MEDIA, offerMediaForPage } from "../../src/lib/offerMedia.js";

beforeEach(() => {
  vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
});

it("registers the main Skillomate offer route", () => {
  expect(route("offer.html")).toBe("/offer");
  expect(pageKeyFromPath("/offer")).toBe("offer.html");
});

it.each(Array.from({ length: 9 }, (_, index) => index + 2))(
  "registers /offer%s as an identical offer-page route",
  (number) => {
    expect(route(`offer${number}.html`)).toBe(`/offer${number}`);
    expect(pageKeyFromPath(`/offer${number}`)).toBe(`offer${number}.html`);
    expect(hasReactPage(`offer${number}.html`)).toBe(true);
  },
);

it("shows the premium offer and opens phone verification from its CTA", () => {
  render(<AdOfferPage />);
  expect(screen.getByRole("heading", { name: "Skillomate Subscription" })).toBeTruthy();
  expect(document.querySelector("video")?.getAttribute("src")).toBe(DEFAULT_OFFER_VIDEO_URL);
  expect(screen.getByText("Secure payments powered by Razorpay")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Subscribe for ₹1/i }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Login / Sign up" })).toBeTruthy();
  expect(screen.getByLabelText("Mobile number")).toBeTruthy();
});

it("assigns a distinct video URL to every offer page", () => {
  const entries = Object.entries(OFFER_MEDIA);
  expect(entries).toHaveLength(10);
  expect(new Set(entries.map(([, media]) => media.videoUrl)).size).toBe(10);
  expect(offerMediaForPage("offer2.html").videoUrl).toBe("/assets/offers/offer-02.mp4");
  expect(offerMediaForPage("offer10.html").videoUrl).toBe("/assets/offers/offer-10.mp4");
});

it("selects the video from the current offer route and falls back safely when it is missing", () => {
  window.history.replaceState({}, "", "/offer2");
  render(<AdOfferPage />);
  const video = document.querySelector("video");
  expect(video?.getAttribute("src")).toBe("/assets/offers/offer-02.mp4");
  fireEvent.error(video);
  expect(video?.getAttribute("src")).toBe(DEFAULT_OFFER_VIDEO_URL);
});
