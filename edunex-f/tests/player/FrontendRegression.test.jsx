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
    expect(screen.getByText("Prompting means giving an AI clear instructions.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Start a new chat" }));
    expect(screen.getByRole("heading", { name: "What can I help you learn?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /What is prompting\?Just now/ }));
    expect(screen.getByText("Prompting means giving an AI clear instructions.")).toBeTruthy();
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
