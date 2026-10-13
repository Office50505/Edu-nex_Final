// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { DashboardPage } from "../../src/pages/DashboardPage.jsx";

vi.mock("../../src/legacyRuntime.js", () => ({ runLegacyPage: () => () => {} }));
vi.mock("../../src/hooks/usePageStyle.js", () => ({ usePageStyle: () => {} }));
vi.mock("../../src/hooks/useEduNexRuntimeReady.js", () => ({ useEduNexRuntimeReady: () => true }));

const courses = [
  { _id: "film", title: "AI Film Making Course", slug: "ai-film-making", videos: [] },
  { _id: "influencer", title: "AI Influencer Course", slug: "ai-influencer", videos: [] },
];

beforeEach(() => {
  window.EduNex = {
    getUser: () => ({ _id: "learner", fullName: "Trial Learner" }),
    getAccessToken: () => "token",
    checkSubscription: async () => ({
      subscriptionDocStatus: "1rs trial",
      trialExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      accessGranted: true,
      hasCourseAccess: true,
      courseIds: ["influencer"],
    }),
    hasCourseAccess: () => true,
    request: async (path) => path.startsWith("/api/recommendations") ? { recommendations: courses } : { courses },
    authRequest: async () => ({ courseProgress: {} }),
    courseImage: () => "https://example.test/course.webp",
    placeholderImage: () => "",
  };
});

afterEach(() => {
  cleanup();
  delete window.EduNex;
  vi.restoreAllMocks();
});

it("shows the next dashboard course as locked during an active trial", async () => {
  render(<DashboardPage />);

  expect(await screen.findByText("Unlocks after 24 hours")).toBeTruthy();
  expect(screen.getByText("Locked during trial")).toBeTruthy();
  expect(screen.getByText("You have 1 Skillomate course available. Continue from your latest saved lesson.")).toBeTruthy();
  expect(screen.getAllByRole("link", { name: /View Course/i })).toHaveLength(1);
  await waitFor(() => expect(screen.getByText("1", { selector: ".stat-pill-value" })).toBeTruthy());
});
