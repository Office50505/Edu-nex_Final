// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Navbar } from "../../src/components/Navbar.jsx";
import { LoginPage } from "../../src/pages/LoginPage.jsx";
import { ProfilePage } from "../../src/pages/ProfilePage.jsx";
import { SignupPage } from "../../src/pages/SignupPage.jsx";
import { CoursesPage } from "../../src/pages/CoursesPage.jsx";
import { plainCourseDescription } from "../../src/pages/CourseDetailsPage.jsx";
import { buildDashboardActivity } from "../../src/pages/DashboardPage.jsx";
import { PaymentPage } from "../../src/pages/PaymentPage.jsx";
import { courseEntryHref } from "../../src/lib/courseNavigation.js";

vi.mock("../../src/legacyRuntime.js", () => ({ runLegacyPage: () => () => {} }));
vi.mock("../../src/hooks/usePageStyle.js", () => ({ usePageStyle: () => {} }));

const cachedUser = { _id: "user-1", fullName: "Aarav Learner", mobileNumber: "+919876543210" };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.dataset.theme = "noir";
  window.history.replaceState(null, "", "/");
  window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value({ top = 0 } = {}) { this.scrollTop = top; },
  });
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  delete window.EduNex;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("reported frontend regressions", () => {
  it("exposes an accessible theme switch in the shared header", () => {
    window.EduNex = {
      applyTheme: vi.fn((theme) => { document.documentElement.dataset.theme = theme; }),
    };
    render(<Navbar pageKey="index.html" />);
    fireEvent.click(screen.getAllByRole("button", { name: "Switch to light theme" })[0]);
    expect(localStorage.getItem("enx-theme")).toBe("light");
    expect(window.EduNex.applyTheme).toHaveBeenCalledWith("light");
  });

  it("does not expose the login form while an existing session is being verified", () => {
    localStorage.setItem("edunexAccessToken", "active-token");
    window.EduNex = {
      request: vi.fn(),
      authRequest: vi.fn(() => new Promise(() => {})),
    };
    render(<LoginPage />);
    expect(screen.getByText("Opening your dashboard...")).toBeTruthy();
    expect(screen.queryByText("Welcome Back")).toBeNull();
  });

  it("renders cached profile data immediately while the server refresh is pending", () => {
    localStorage.setItem("edunexAccessToken", "active-token");
    localStorage.setItem("edunexUser", JSON.stringify(cachedUser));
    window.EduNex = {
      request: vi.fn(),
      authRequest: vi.fn(() => new Promise(() => {})),
      getAccessToken: () => "active-token",
      getUser: () => cachedUser,
      applyTheme: vi.fn(),
      avatarFallback: vi.fn(() => "fallback.png"),
      renderUserAvatar: vi.fn(),
    };
    render(<ProfilePage />);
    expect(screen.getByText("Aarav Learner")).toBeTruthy();
    expect(screen.queryByText("Loading your profile")).toBeNull();
  });

  it("converts course Markdown into clean display text", () => {
    expect(plainCourseDescription("## Build **AI skills**\n- Ship a [project](https://example.com) with `code`")).toBe(
      "Build AI skills\n• Ship a project with code",
    );
  });

  it("derives dashboard activity from saved learner progress", () => {
    window.EduNex = { getUser: () => cachedUser };
    const now = new Date(2026, 8, 17, 12, 0, 0);
    localStorage.setItem("edunexCourseProgress:user-1:course-1", JSON.stringify({
      percent: 50,
      completed: 2,
      lessonIndex: 2,
      lastViewedAt: now.toISOString(),
      watchedSeconds: 3600,
      activityByDay: { "2026-9-17": 3600 },
    }));
    const activity = buildDashboardActivity([{
      _id: "course-1",
      videos: [{ duration: 1800 }, { duration: 1800 }, { duration: 1800 }, { duration: 1800 }],
    }], now);
    expect(activity.timeLabel).toBe("1h");
    expect(activity.completedLabel).toBe("2 lessons");
    expect(activity.statusLabel).toBe("In progress");
    expect(activity.days[6].value).toBe(60);
  });

  it("submits signup with Enter semantics and supports desktop age dragging", async () => {
    window.EduNex = {
      request: vi.fn(async (path) => {
        if (path.includes("send-mobile-otp")) return { devOtp: "123456" };
        if (path.includes("verify-mobile-otp")) return { signupToken: "signup-token" };
        return {};
      }),
      normalizePhone: (value) => `+91${String(value).replace(/\D/g, "")}`,
      safeNext: () => "/payment.html",
    };
    render(<SignupPage />);
    const phone = screen.getByLabelText("Phone Number");
    fireEvent.change(phone, { target: { value: "9876543210" } });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Send OTP & Continue" }).getAttribute("type")).toBe("submit");
    fireEvent.submit(phone.closest("form"));
    const verify = await screen.findByRole("button", { name: "Verify OTP" });
    await act(async () => { fireEvent.click(verify); });
    const ageList = await screen.findByRole("listbox", { name: "Your Age" });
    const initialScrollTop = ageList.scrollTop;
    fireEvent.pointerDown(ageList, { pointerId: 1, pointerType: "mouse", button: 0, clientY: 100 });
    fireEvent.pointerMove(ageList, { pointerId: 1, pointerType: "mouse", clientY: 48 });
    fireEvent.pointerUp(ageList, { pointerId: 1, pointerType: "mouse", clientY: 48 });
    await waitFor(() => expect(ageList.getAttribute("aria-activedescendant")).toBe("signup-age-25"));
    expect(ageList.scrollTop).toBeGreaterThan(initialScrollTop);
  });

  it("does not flash invented filters or promotional content while courses load", () => {
    window.EduNex = {
      request: vi.fn(() => new Promise(() => {})),
      getAccessToken: vi.fn(() => ""),
    };
    render(<CoursesPage />);
    expect(screen.getByText("Loading course filters...")).toBeTruthy();
    expect(screen.queryByText("AI Freelancing")).toBeNull();
    expect(screen.queryByText("Your Path to Mastery")).toBeNull();
  });

  it("sends non-subscribers straight to checkout and subscribers to the player", () => {
    const course = { _id: "course-1" };
    expect(courseEntryHref(course)).toBe("/payment?courseId=course-1&next=%2Fvideos%3FcourseId%3Dcourse-1%26video%3D0");
    expect(courseEntryHref(course, { hasAccess: true })).toBe("/videos?courseId=course-1&video=0");
  });

  it("opens generic 24-hour trial links as a focused checkout without a course preview", () => {
    window.history.replaceState(null, "", "/payment");
    window.EduNex = {
      request: vi.fn(() => new Promise(() => {})),
    };
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    const { container } = render(<PaymentPage />);
    expect(screen.getByText("Get Full Access")).toBeTruthy();
    expect(container.querySelector(".course-preview")).toBeNull();
    expect(container.querySelector(".pay-grid.direct-checkout")).toBeTruthy();
  });
});
