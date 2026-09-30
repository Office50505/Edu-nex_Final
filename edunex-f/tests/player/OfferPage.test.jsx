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
  expect(route("offer.html")).toBe("/static-pages/skillomate-ai-influencer-course/#paywall");
  expect(pageKeyFromPath("/ai")).toBe("offer.html");
  expect(route("/offer?utm_source=ad#subscribe")).toBe("/static-pages/skillomate-ai-influencer-course/?utm_source=ad#paywall");
  expect(route("/offer.html")).toBe("/static-pages/skillomate-ai-influencer-course/#paywall");
  expect(pageKeyFromPath("/offer")).toBe("offer.html");
});

it.each(Array.from({ length: 9 }, (_, index) => index + 2))(
  "registers /offer%s as an identical offer-page route",
  (number) => {
    expect(route(`offer${number}.html`)).toBe(number === 2 ? "/static-pages/skillomate-ai-influencer-course2/" : `/offer${number}`);
    expect(pageKeyFromPath(`/offer${number}`)).toBe(`offer${number}.html`);
    expect(hasReactPage(`offer${number}.html`)).toBe(true);
  },
);

it("keeps the offer2 static page as the canonical route", () => {
  expect(route("/static-pages/skillomate-ai-influencer-course2/#paywall")).toBe("/static-pages/skillomate-ai-influencer-course2/#paywall");
  expect(pageKeyFromPath("/static-pages/skillomate-ai-influencer-course2")).toBe("offer2.html");
});

it("shows the premium offer and opens phone verification from its CTA", () => {
  render(<AdOfferPage />);
  expect(screen.getByRole("heading", { name: "Skillomate Subscription" })).toBeTruthy();
  expect(document.querySelector("video")?.getAttribute("src")).toBe(DEFAULT_OFFER_VIDEO_URL);
  expect(screen.getByText("Secure payments powered by Skillomate payment partners")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^Subscribe for ₹1 →$/i }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Login / Sign up" })).toBeTruthy();
  expect(screen.getByLabelText("Mobile number")).toBeTruthy();
});

it("opens phone verification when the offer price card is clicked", () => {
  render(<AdOfferPage />);
  fireEvent.click(screen.getByRole("button", { name: /Subscribe for ₹1 - limited time offer/i }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Login / Sign up" })).toBeTruthy();
});

it("assigns a distinct video URL to every offer page", () => {
  const entries = Object.entries(OFFER_MEDIA);
  expect(entries).toHaveLength(10);
  expect(new Set(entries.map(([, media]) => media.videoUrl)).size).toBe(10);
  expect(offerMediaForPage("offer2.html").videoUrl).toBe("/assets/offer-video/Video-65454.mp4");
  expect(offerMediaForPage("offer3.html").videoUrl).toBe("/assets/offer-video/offer-3.mov");
  expect(offerMediaForPage("offer4.html").videoUrl).toBe("/assets/offer-video/offer-4.mov");
  expect(offerMediaForPage("offer10.html").videoUrl).toBe("/assets/offers/offer-10.mp4");
});

it("selects the video from the current offer route and falls back safely when it is missing", () => {
  window.history.replaceState({}, "", "/offer2");
  render(<AdOfferPage />);
  const video = document.querySelector("video");
  expect(video?.getAttribute("src")).toBe("/assets/offer-video/Video-65454.mp4");
  fireEvent.error(video);
  expect(video?.getAttribute("src")).toBe(DEFAULT_OFFER_VIDEO_URL);
});

it("selects the uploaded video from the /offer3 route", () => {
  window.history.replaceState({}, "", "/offer3");
  render(<AdOfferPage />);
  expect(document.querySelector("video")?.getAttribute("src")).toBe("/assets/offer-video/offer-3.mov");
});

it("selects the uploaded video from the /offer4 route", () => {
  window.history.replaceState({}, "", "/offer4");
  render(<AdOfferPage />);
  expect(document.querySelector("video")?.getAttribute("src")).toBe("/assets/offer-video/offer-4.mov");
});
