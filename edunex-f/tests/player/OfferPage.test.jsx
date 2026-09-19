// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AdOfferPage } from "../../src/pages/AdOfferPage.jsx";
import { pageKeyFromPath, route } from "../../src/lib/routes.js";

beforeEach(() => {
  vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

it("registers the main Skillomate offer route", () => {
  expect(route("offer.html")).toBe("/offer");
  expect(pageKeyFromPath("/offer")).toBe("offer.html");
});

it("shows the premium offer and opens phone verification from its CTA", () => {
  render(<AdOfferPage />);
  expect(screen.getByRole("heading", { name: "Skillomate Subscription" })).toBeTruthy();
  expect(document.querySelector("video")?.getAttribute("src")).toBe("/assets/skillomate-offer-preview.mp4");
  expect(screen.getByText("Secure payments powered by Razorpay")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Subscribe for ₹1/i }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Login / Sign up" })).toBeTruthy();
  expect(screen.getByLabelText("Mobile number")).toBeTruthy();
});
