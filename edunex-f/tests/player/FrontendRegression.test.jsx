// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Navbar } from "../../src/components/Navbar.jsx";
import { Footer } from "../../src/components/Footer.jsx";
import { LoginPage } from "../../src/pages/LoginPage.jsx";
import { ProfilePage } from "../../src/pages/ProfilePage.jsx";
import { SignupPage } from "../../src/pages/SignupPage.jsx";
import { CoursesPage } from "../../src/pages/CoursesPage.jsx";
import { AiTutorPage } from "../../src/pages/AiTutorPage.jsx";
import { plainCourseDescription } from "../../src/pages/CourseDetailsPage.jsx";
import { buildDashboardActivity, DashboardPage, dashCourseProgress } from "../../src/pages/DashboardPage.jsx";
import { PaymentPage } from "../../src/pages/PaymentPage.jsx";
import { activeProgressLessons, CurriculumShowcase } from "../../src/pages/HomePage.jsx";
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
  it("restores legacy and completed lectures in Continue Learning history", () => {
    localStorage.setItem("edunexCourseProgress:course-history", JSON.stringify({
      viewed: true,
      percent: 100,
      completed: 2,
      lessonIndex: 0,
      lastWatchedVideoId: "lesson-2",
      lastViewedAt: "2026-09-18T12:00:00.000Z",
    }));
    const course = {
      _id: "course-history",
      title: "History Course",
      videos: [
        { _id: "lesson-1", title: "First lesson" },
        { _id: "lesson-2", title: "Last watched lesson" },
      ],
    };

    const history = activeProgressLessons([course], "user-1");

    expect(history).toHaveLength(1);
    expect(history[0].lessonIndex).toBe(1);
    expect(history[0].video.title).toBe("Last watched lesson");
    expect(localStorage.getItem("edunexCourseProgress:user-1:course-history")).toBeTruthy();
  });

  it("hides Continue Learning until the user has watched a lecture", () => {
    const course = {
      _id: "course-history",
      title: "History Course",
      category: "AI Basics",
      videos: [{ _id: "lesson-1", title: "First lesson", duration: 120 }],
    };
    const view = render(<CurriculumShowcase courses={[course]} status="ready" authUserId="user-1" hasAccess />);

    expect(screen.queryByText("Continue Learning")).toBeNull();
    expect(screen.queryByText("No learning history yet")).toBeNull();
    expect(screen.queryByText("Try 24 Hours for ₹1")).toBeNull();
    expect(screen.queryByText("Unlock 24 Hours for ₹1")).toBeNull();
    expect(screen.getByRole("heading", { name: "Lectures" })).toBeTruthy();

    localStorage.setItem("edunexCourseProgress:user-1:course-history", JSON.stringify({
      viewed: true,
      lessonIndex: 0,
      lastWatchedVideoId: "lesson-1",
      lastViewedAt: "2026-09-19T12:00:00.000Z",
      watchedSeconds: 30,
    }));
    view.rerender(<CurriculumShowcase courses={[course]} status="ready" authUserId="user-1" hasAccess />);

    expect(screen.getByText("Continue Learning")).toBeTruthy();
    expect(screen.getAllByText("First lesson").length).toBeGreaterThan(0);
  });

  it("shows the complete lecture sequence in course order", () => {
    const videos = Array.from({ length: 34 }, (_, index) => ({
      _id: `lesson-${index + 1}`,
      title: `Serial lesson ${index + 1}`,
      duration: 120,
    }));
    render(<CurriculumShowcase courses={[{ _id: "course-34", title: "Full Course", videos }]} status="ready" authUserId="user-1" hasAccess />);

    expect(screen.getByRole("heading", { name: "Lectures" })).toBeTruthy();
    expect(screen.getByText("Lecture 1 of 34")).toBeTruthy();
    expect(screen.getByText("Lecture 34 of 34")).toBeTruthy();
    expect(screen.getAllByText("Open lecture")).toHaveLength(34);
  });

  it("does not render app download badges in the shared footer", () => {
    render(<Footer />);
    expect(screen.queryByText("App Download")).toBeNull();
    expect(screen.queryByText("App Store")).toBeNull();
    expect(screen.queryByText("Google Play")).toBeNull();
  });

  it("exposes an accessible theme switch in the shared header", () => {
    window.EduNex = {
      applyTheme: vi.fn((theme) => { document.documentElement.dataset.theme = theme; }),
    };
    render(<Navbar pageKey="index.html" />);
    fireEvent.click(screen.getAllByRole("button", { name: "Switch to light theme" })[0]);
    expect(localStorage.getItem("enx-theme")).toBe("light");
    expect(window.EduNex.applyTheme).toHaveBeenCalledWith("light");
  });

  it("uses a dedicated AI page from the persistent mobile navigation", () => {
    render(<Navbar pageKey="ai-tutor.html" />);
    const aiLink = screen.getByRole("link", { name: "AI" });
    expect(aiLink.getAttribute("href")).toBe("/ai-tutor");
    expect(aiLink.classList.contains("active")).toBe(true);
    expect(screen.queryByRole("button", { name: "Open Nex AI" })).toBeNull();
  });

  it("renders the AI tutor with one focused set of starter prompts", () => {
    window.EduNex = {
      request: vi.fn(),
      getAccessToken: vi.fn(() => "active-token"),
      getUser: vi.fn(() => cachedUser),
    };
    render(<AiTutorPage />);
    expect(screen.getByRole("heading", { name: "What can I help you learn?" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "AI assistant" }).getAttribute("src")).toBe("/assets/nex-avatar.png");
    expect(screen.getByRole("group", { name: "Suggested questions" }).querySelectorAll("button")).toHaveLength(4);
    expect(screen.queryByRole("group", { name: "Follow-up suggestions" })).toBeNull();
    expect(document.querySelector(".tutor-top-bar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Report a problem" })).toBeNull();
  });

  it("lets each learner name the AI without letting a message replace the header name", async () => {
    window.EduNex = {
      request: vi.fn(),
      getAccessToken: vi.fn(() => "active-token"),
      getUser: vi.fn(() => cachedUser),
      authRequest: vi.fn(async () => ({ reply: "Hello! How can I help?", provider: "test" })),
    };
    render(<AiTutorPage />);

    expect(await screen.findByRole("dialog", { name: "Name your AI" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Customize AI name. Current name: AI" })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "AI name" }), { target: { value: "Nova" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    expect(localStorage.getItem("edunexAiBotName:user-1")).toBe("Nova");
    expect(screen.getByRole("button", { name: "Customize AI name. Current name: Nova" })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Message Nova" }), { target: { value: "hie" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("Hello! How can I help?");

    expect(screen.getByRole("button", { name: "Customize AI name. Current name: Nova" })).toBeTruthy();
    expect(JSON.parse(window.EduNex.authRequest.mock.calls[0][1].body).assistantName).toBe("Nova");
  });

  it("shows the expressive thinking model and animated dots while an answer is pending", async () => {
    localStorage.setItem("edunexAiBotName:user-1", "AI");
    localStorage.setItem("edunexAiBotSetupComplete:user-1", "true");
    let resolveRequest;
    window.EduNex = {
      request: vi.fn(),
      getAccessToken: vi.fn(() => "active-token"),
      getUser: vi.fn(() => cachedUser),
      authRequest: vi.fn(() => new Promise(resolve => { resolveRequest = resolve; })),
    };
    render(<AiTutorPage />);

    fireEvent.change(screen.getByRole("textbox", { name: "Message AI" }), { target: { value: "Explain this" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(screen.getByLabelText("AI is typing")).toBeTruthy();
    expect(document.querySelector('.tutor-thinking .ai-model-cutout')).toBeTruthy();
    expect(document.querySelectorAll('.tutor-thinking .ai-thinking-overhead > span')).toHaveLength(3);
    expect(document.querySelector('.tutor-thinking .nex-avatar-image')?.getAttribute('src')).toBe('/assets/nex-avatar-thinking.png');

    await act(async () => { resolveRequest({ reply: "Here is the explanation." }); });
    expect(await screen.findByText("Here is the explanation.")).toBeTruthy();
    expect(document.querySelector('.chat-bubble.ai .ai-model-cutout')).toBeTruthy();
    expect(document.querySelector('.chat-bubble.ai .nex-avatar-image')?.getAttribute('src')).toBe('/assets/nex-avatar.png');
  });

  it("keeps NEX conversations and restores them from the shared chat history", async () => {
    localStorage.setItem("edunexAiBotName:user-1", "AI");
    localStorage.setItem("edunexAiBotSetupComplete:user-1", "true");
    window.EduNex = {
      request: vi.fn(),
      getAccessToken: vi.fn(() => "active-token"),
      getUser: vi.fn(() => cachedUser),
      authRequest: vi.fn(async () => ({ reply: "Prompting means giving an AI clear instructions.", provider: "test" })),
    };
    render(<AiTutorPage />);

    fireEvent.change(screen.getByRole("textbox", { name: "Message AI" }), { target: { value: "What is prompting?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("Prompting means giving an AI clear instructions.");
    expect(document.querySelector('.chat-bubble.ai .nex-avatar-image')?.getAttribute('src')).toBe('/assets/nex-avatar.png');
    expect(screen.getByLabelText("Aarav Learner").textContent).toBe("A");

    const saved = JSON.parse(localStorage.getItem("edunexNexAiChats:user-1"));
    expect(saved[0].title).toBe("What is prompting?");
    expect(saved[0].messages.map(message => message.role)).toEqual(["user", "assistant"]);
    expect(screen.getByRole("button", { name: /What is prompting\?Just now/ })).toBeTruthy();

    cleanup();
    render(<AiTutorPage />);
    expect(screen.getByRole("heading", { name: "What can I help you learn?" })).toBeTruthy();
    expect(screen.queryByText("Prompting means giving an AI clear instructions.")).toBeNull();
    expect(screen.getByRole("button", { name: /What is prompting\?Just now/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /What is prompting\?Just now/ }));
    expect(screen.getByText("Prompting means giving an AI clear instructions.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Start a new chat" }));
    expect(screen.getByRole("heading", { name: "What can I help you learn?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /What is prompting\?Just now/ })).toBeTruthy();
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
    expect(screen.getByRole("button", { name: "Light" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dark" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "System" })).toBeNull();
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
    expect(activity.completedLessons).toBe(2);
    expect(activity.completedLabel).toBe("2 lessons");
    expect(activity.statusLabel).toBe("In progress");
    expect(activity.days[6].value).toBe(60);
  });

  it("restores dashboard lesson counts and progress bars from server progress", async () => {
    const videos = Array.from({ length: 34 }, (_, index) => ({ _id: `lesson-${index + 1}`, title: `Lesson ${index + 1}`, duration: 600 }));
    const completedVideoIds = videos.slice(0, 20).map((video) => video._id);
    const videoProgress = Object.fromEntries(videos.map((video, index) => [video._id, {
      videoId: video._id,
      watchedSeconds: index < 20 ? 600 : 0,
      durationSeconds: 600,
      resumePosition: index < 20 ? 600 : 0,
    }]));
    window.EduNex = {
      getUser: () => cachedUser,
      getAccessToken: () => "active-token",
      checkSubscription: vi.fn(async () => ({ status: "active" })),
      hasCourseAccess: vi.fn(() => true),
      request: vi.fn(async (path) => path === "/api/courses" ? [{ _id: "course-1", title: "AI Influencer Course", videos }] : { recommendations: [] }),
      authRequest: vi.fn(async () => ({
        courseProgress: {
          "course-1": {
            completedVideoIds,
            completedCount: 20,
            totalVideos: 34,
            progressPercent: 59,
            videoProgress,
            lastWatchedVideoId: "lesson-20",
            updatedAt: "2026-09-17T12:00:00.000Z",
          },
        },
      })),
      courseImage: vi.fn(() => "course.jpg"),
      placeholderImage: vi.fn(() => "fallback.jpg"),
    };

    render(<DashboardPage />);

    expect(await screen.findByText("59% complete")).toBeTruthy();
    expect(screen.getByText("20 Done")).toBeTruthy();
    expect(screen.getByText("20 lessons")).toBeTruthy();
    expect(document.querySelector(".hist-progress-fill")?.style.width).toBe("59%");
    expect(screen.getAllByText("In Progress")).toHaveLength(2);
    expect(window.EduNex.authRequest).toHaveBeenCalledWith("/api/user/user-1/progress");
    expect(JSON.parse(localStorage.getItem("edunexCourseProgress:user-1:course-1")).completed).toBe(20);
    expect(document.querySelector("#trialGate")).toBeNull();
  });

  it("shows renewal instead of another trial when a subscription has expired", async () => {
    window.EduNex = {
      getUser: () => cachedUser,
      getAccessToken: () => "active-token",
      checkSubscription: vi.fn(async () => ({
        status: "none",
        subscriptionDocStatus: "expired",
        hasActiveAccess: false,
        trialEligible: false,
      })),
      hasCourseAccess: vi.fn((value) => value.hasActiveAccess),
      request: vi.fn(),
    };

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getAllByText("Subscribe for ₹499/month")).toHaveLength(2));
    expect(screen.getByRole("link", { name: /Subscribe for ₹499\/month/ })).toBeTruthy();
    expect(screen.queryByText("Start your 24-hour trial for ₹1")).toBeNull();
    expect(document.querySelector("#trialGate")?.classList.contains("is-open")).toBe(true);
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.style.position).toBe("fixed");
  });

  it("offers the monthly plan after the account has used its one-time trial", async () => {
    localStorage.setItem("edunexAccessToken", "active-token");
    window.EduNex = { request: vi.fn() };
    let checkoutBody;
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      if (url === "/api/payment/config") {
        return { ok: true, status: 200, json: async () => ({ trialAmountPaise: 100, subscriptionAmountPaise: 49900, trialHours: 24 }) };
      }
      if (url === "/api/payment/subscription-status") {
        return { ok: true, status: 200, text: async () => JSON.stringify({
          status: "trial",
          hasActiveAccess: true,
          trialEligible: false,
          subscriptionType: "trial",
          autoRenewEnabled: false,
        }) };
      }
      if (url === "/api/payment/initiate-trial") {
        checkoutBody = JSON.parse(options.body);
        return { ok: false, status: 503, text: async () => JSON.stringify({ error: "Test checkout stopped" }) };
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    render(<PaymentPage />);

    const monthlyButton = await screen.findByRole("button", { name: /Subscribe for ₹499\/month/ });
    expect(screen.getByText("Monthly Plan")).toBeTruthy();
    expect(screen.getByText(/one-time trial has already been used/i)).toBeTruthy();
    fireEvent.click(monthlyButton);
    await waitFor(() => expect(checkoutBody?.paymentType).toBe("monthly"));
    expect(checkoutBody.mandateConsent).toBe(true);
  });

  it("uses an unscoped legacy progress cache when server progress is unavailable", () => {
    window.EduNex = { getUser: () => cachedUser };
    localStorage.setItem("edunexCourseProgress:course-1", JSON.stringify({ completed: 20, percent: 59, lessonIndex: 20 }));
    expect(dashCourseProgress({ _id: "course-1", videos: Array.from({ length: 34 }) }).percent).toBe(59);
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

  it("does not render category filters or promotional content while courses load", () => {
    window.EduNex = {
      request: vi.fn(() => new Promise(() => {})),
      getAccessToken: vi.fn(() => ""),
    };
    render(<CoursesPage />);
    expect(document.querySelector(".filter-pills")).toBeNull();
    expect(screen.getByText("Loading courses...")).toBeTruthy();
    expect(screen.queryByText("AI Freelancing")).toBeNull();
    expect(screen.queryByText("Your Path to Mastery")).toBeNull();
  });

  it("shows View Course when a paid period remains active after auto-renewal ends", async () => {
    window.EduNex = {
      request: vi.fn(async (path) => path === "/api/courses" ? [{
        _id: "course-1",
        title: "AI Influencer Course",
        category: "AI Basics",
        videos: Array.from({ length: 34 }, (_, index) => ({ _id: `lesson-${index + 1}` })),
      }] : {}),
      authRequest: vi.fn(async (path) => path === "/api/payment/subscription-status"
        ? { status: "active", subscriptionDocStatus: "expired", hasActiveAccess: true, currentPeriodEnd: "2026-10-19T09:02:10.908Z" }
        : { courses: [] }),
      getAccessToken: vi.fn(() => "active-token"),
      hasCourseAccess: vi.fn((subscription) => subscription.hasActiveAccess === true),
      courseCategory: vi.fn((course) => course.category),
      courseImage: vi.fn(() => "course.jpg"),
      placeholderImage: vi.fn(() => "fallback.jpg"),
    };

    render(<CoursesPage />);

    expect(await screen.findByRole("button", { name: "View Course" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start ₹1 trial" })).toBeNull();
  });

  it("sends non-subscribers straight to checkout and subscribers to the player", () => {
    const course = { _id: "course-1" };
    expect(courseEntryHref(course)).toBe("/payment?courseId=course-1&next=%2Fvideos%3FcourseId%3Dcourse-1");
    expect(courseEntryHref(course, { hasAccess: true })).toBe("/videos?courseId=course-1");
    expect(courseEntryHref(course, { hasAccess: true, lessonIndex: 3 })).toBe("/videos?courseId=course-1&video=3");
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
