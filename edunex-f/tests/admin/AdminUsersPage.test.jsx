// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { adminJson } = vi.hoisted(() => ({ adminJson: vi.fn() }));

vi.mock("../../src/pages/admin/adminApi.js", () => ({
  adminJson,
  formatDate: (value) => String(value || "Never"),
  formatDateTime: (value) => String(value || "Never"),
  formatNumber: (value) => String(Number(value || 0)),
  formatWatchDuration: (value) => `${Number(value || 0)} minutes`,
  requireAdmin: () => true,
}));

vi.mock("../../src/pages/admin/AdminShell.jsx", () => ({
  AdminShell: ({ children }) => <main>{children}</main>,
  Message: ({ text, type }) => text ? <div role={type === "error" ? "alert" : "status"}>{text}</div> : null,
}));

vi.mock("../../src/pages/admin/DeletionRequests.jsx", () => ({ DeletionRequests: () => null }));

import { AdminUsersPage } from "../../src/pages/admin/AdminUsersPage.jsx";

const learner = {
  _id: "user-1",
  fullName: "Test Learner",
  email: "learner@example.com",
  mobileNumber: "919999999999",
  isActive: true,
  isMobileVerified: true,
  isEmailVerified: true,
  subscriptionStatus: "none",
  purchasedCourses: [],
  courseEntitlements: [],
  progressCourses: [],
  progressSummary: { totalCourses: 0, completedCourses: 0, averageProgress: 0 },
  watchSummary: { watchedMinutes: 0, watchedVideos: 0, completedVideos: 0 },
  presence: { isOnline: false },
  createdAt: "2026-09-21T00:00:00.000Z",
};

const course = {
  _id: "course-1",
  title: "AI Influencer Course",
  status: "published",
  category: { name: "AI" },
};

function mockAdminApi(courses = [course]) {
  adminJson.mockImplementation(async (path, options = {}) => {
    if (path === "/api/admin/user-management") return [learner];
    if (path === "/api/admin/courses?summary=1") return courses;
    if (path.endsWith("/actions")) return [];
    if (path.endsWith("/ip-location")) return { location: "Unavailable" };
    if (path === "/api/admin/users/user-1/courses" && options.method === "PATCH") {
      return {
        message: "AI Influencer Course added to this learner.",
        user: {
          _id: learner._id,
          purchasedCourses: [course._id],
          courseEntitlements: [{ course: course._id, accessType: "permanent", expiresAt: null }],
        },
      };
    }
    throw new Error(`Unexpected request: ${path}`);
  });
}

beforeEach(() => {
  adminJson.mockReset();
  window.alert = vi.fn();
  window.confirm = vi.fn(() => true);
});

afterEach(() => cleanup());

it("assigns a published course and gives immediate visible confirmation", async () => {
  mockAdminApi();
  render(<AdminUsersPage />);

  fireEvent.click(await screen.findByRole("button", { name: "Manage" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add purchased course" }));
  expect(screen.getByRole("dialog", { name: "Add purchased course" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Add course" }));

  await waitFor(() => expect(window.alert).toHaveBeenCalledWith("AI Influencer Course added to this learner."));
  const grantCall = adminJson.mock.calls.find(([path, options]) => path.endsWith("/courses") && options.method === "PATCH");
  expect(JSON.parse(grantCall[1].body)).toMatchObject({
    action: "grant",
    courseId: course._id,
    accessType: "permanent",
  });
  expect(screen.getByText(/1 courses owned/)).toBeTruthy();
  expect(screen.getAllByText("AI Influencer Course").length).toBeGreaterThanOrEqual(2);
});

it("explains why assignment cannot start when no course is published", async () => {
  mockAdminApi([]);
  render(<AdminUsersPage />);

  fireEvent.click(await screen.findByRole("button", { name: "Manage" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add purchased course" }));

  expect(window.alert).toHaveBeenCalledWith("No published courses are available to assign. Publish a course first, then try again.");
  expect(screen.getByRole("alert").textContent).toContain("No published courses are available");
});
