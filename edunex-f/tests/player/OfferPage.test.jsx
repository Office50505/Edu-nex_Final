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
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ gateway: "razorpay" }) })));
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

it("shows the premium offer and opens phone verification from its CTA", async () => {
  render(<AdOfferPage />);
  expect(await screen.findByRole("heading", { name: "Skillomate Subscription" })).toBeTruthy();
  expect(document.querySelector("video")?.getAttribute("src")).toBe(DEFAULT_OFFER_VIDEO_URL);
  expect(screen.getByText("Secure payments powered by Skillomate payment partners")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^Subscribe for ₹1 →$/i }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Login / Sign up" })).toBeTruthy();
  expect(screen.getByLabelText("Mobile number")).toBeTruthy();
});

it("opens phone verification when the offer price card is clicked", async () => {
  render(<AdOfferPage />);
  fireEvent.click(await screen.findByRole("button", { name: "View ₹1 offer details" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Login / Sign up" })).toBeTruthy();
});

it("opens phone verification when the special offer pill is clicked", async () => {
  render(<AdOfferPage />);
  fireEvent.click(await screen.findByRole("button", { name: /Special offer - subscribe for ₹1/i }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Login / Sign up" })).toBeTruthy();
});

it("keeps the offer visible and blocks checkout while pricing fails, then recovers on retry", async () => {
  let pricingReady = false;
  vi.stubGlobal("fetch", vi.fn(async url => {
    if (url.endsWith("/api/onboarding/config") && !pricingReady) throw new Error("Pricing API unavailable");
    return { ok: true, json: async () => ({ gateway: "phonepe", checkoutEnabled: true, oneTimeAmountPaise: 29900, accessDays: 30 }) };
  }));
  render(<AdOfferPage />);
  expect(await screen.findByText(/Payment pricing is temporarily unavailable/)).toBeTruthy();
  expect(document.querySelector("video")?.getAttribute("src")).toBe(DEFAULT_OFFER_VIDEO_URL);
  expect(screen.getByRole("button", { name: /Checkout unavailable/ }).disabled).toBe(true);
  expect(screen.queryByText("₹1")).toBeNull();
  pricingReady = true;
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("button", { name: /Pay ₹299 once/ })).toBeTruthy();
});

it("shows the PhonePe price but blocks checkout when new payments are disabled", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ gateway: "phonepe", checkoutEnabled: false, oneTimeAmountPaise: 29900, accessDays: 30 }) })));
  render(<AdOfferPage />);
  expect(await screen.findByText(/Checkout is temporarily unavailable/)).toBeTruthy();
  expect(screen.getByText("₹299")).toBeTruthy();
  expect(screen.getByRole("button", { name: /Checkout unavailable/ }).disabled).toBe(true);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("uses Video-65454.mp4 on the main offer and Offer 2", () => {
  const entries = Object.entries(OFFER_MEDIA);
  expect(entries).toHaveLength(10);
  expect(new Set(entries.map(([, media]) => media.videoUrl)).size).toBe(9);
  expect(offerMediaForPage("offer.html").videoUrl).toBe("/assets/offer-video/Video-65454.mp4");
  expect(offerMediaForPage("offer2.html").videoUrl).toBe("/assets/offer-video/Video-65454.mp4");
  expect(offerMediaForPage("offer3.html").videoUrl).toBe("/assets/offer-video/offer-3.mov");
  expect(offerMediaForPage("offer4.html").videoUrl).toBe("/assets/offer-video/offer-4.mov");
  expect(offerMediaForPage("offer10.html").videoUrl).toBe("/assets/offers/offer-10.mp4");
});

it("selects the video from the current offer route and falls back safely when it is missing", async () => {
  window.history.replaceState({}, "", "/offer2");
  render(<AdOfferPage />);
  await screen.findByRole("heading", { name: "Skillomate Subscription" });
  const video = document.querySelector("video");
  expect(video?.getAttribute("src")).toBe("/assets/offer-video/Video-65454.mp4");
  fireEvent.error(video);
  expect(video?.getAttribute("src")).toBe(DEFAULT_OFFER_VIDEO_URL);
});

it("selects the uploaded video from the /offer3 route", async () => {
  window.history.replaceState({}, "", "/offer3");
  render(<AdOfferPage />);
  await screen.findByRole("heading", { name: "Skillomate Subscription" });
  expect(document.querySelector("video")?.getAttribute("src")).toBe("/assets/offer-video/offer-3.mov");
});

it("selects the uploaded video from the /offer4 route", async () => {
  window.history.replaceState({}, "", "/offer4");
  render(<AdOfferPage />);
  await screen.findByRole("heading", { name: "Skillomate Subscription" });
  expect(document.querySelector("video")?.getAttribute("src")).toBe("/assets/offer-video/offer-4.mov");
});
