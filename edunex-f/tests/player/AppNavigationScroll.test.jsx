// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../src/App.jsx";

vi.mock("../../src/components/Navbar.jsx", () => ({
  Navbar: () => (
    <nav>
      <a href="/">Home</a>
      <a href="/courses">Courses</a>
    </nav>
  ),
}));
vi.mock("../../src/components/Footer.jsx", () => ({ Footer: () => <footer>Footer</footer> }));
vi.mock("../../src/components/ProblemReport.jsx", () => ({ ProblemReport: () => null }));
vi.mock("../../src/hooks/usePresenceHeartbeat.js", () => ({ usePresenceHeartbeat: () => {} }));
vi.mock("../../src/lib/pageLoaders.jsx", () => ({
  hasReactPage: (pageKey) => ["index.html", "courses.html"].includes(pageKey),
  preloadPage: vi.fn(() => Promise.resolve()),
  reactPageLoaders: {
    "index.html": () => <main>Home page</main>,
    "courses.html": () => <main>Courses page</main>,
  },
}));

describe("application navigation scroll restoration", () => {
  let originalScrollRestoration;

  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    originalScrollRestoration = window.history.scrollRestoration;
    Object.defineProperty(window.history, "scrollRestoration", {
      configurable: true,
      writable: true,
      value: "auto",
    });
    vi.stubGlobal("requestAnimationFrame", (callback) => {
      callback();
      return 1;
    });
    vi.stubGlobal("scrollTo", vi.fn());
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(window.history, "scrollRestoration", {
      configurable: true,
      writable: true,
      value: originalScrollRestoration,
    });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("starts every app link destination at the top", async () => {
    render(<App />);
    await screen.findByText("Home page");
    const focusedInput = document.createElement("input");
    document.body.appendChild(focusedInput);
    focusedInput.focus();
    expect(document.activeElement).toBe(focusedInput);
    window.scrollTo.mockClear();
    document.documentElement.scrollTop = 420;
    document.body.scrollTop = 420;

    fireEvent.click(screen.getByRole("link", { name: "Courses" }));

    await screen.findByText("Courses page");
    expect(window.location.pathname).toBe("/courses");
    expect(document.documentElement.scrollTop).toBe(0);
    expect(document.body.scrollTop).toBe(0);
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: "auto" });
    expect(document.activeElement).not.toBe(focusedInput);
    focusedInput.remove();
  });

  it("clears stale fullscreen locks when a standard page renders", async () => {
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = "-280px";
    document.body.style.width = "100%";
    document.body.classList.add("has-viewport-lock", "has-edunex-mobile-reel", "has-edunex-player-fullscreen");

    render(<App />);
    await screen.findByText("Home page");

    expect(document.documentElement.style.overflow).toBe("");
    expect(document.body.style.overflow).toBe("");
    expect(document.body.style.position).toBe("");
    expect(document.body.style.top).toBe("");
    expect(document.body.classList.contains("has-viewport-lock")).toBe(false);
    expect(document.body.classList.contains("has-edunex-mobile-reel")).toBe(false);
    expect(document.body.classList.contains("has-edunex-player-fullscreen")).toBe(false);
  });

  it("resets the page after Back or Forward navigation", async () => {
    render(<App />);
    await screen.findByText("Home page");
    fireEvent.click(screen.getByRole("link", { name: "Courses" }));
    await screen.findByText("Courses page");
    window.scrollTo.mockClear();
    document.documentElement.scrollTop = 560;
    document.body.scrollTop = 560;

    act(() => {
      window.history.replaceState(null, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    await screen.findByText("Home page");
    await waitFor(() => expect(window.scrollTo).toHaveBeenCalled());
    expect(document.documentElement.scrollTop).toBe(0);
    expect(document.body.scrollTop).toBe(0);
  });

  it("disables native restoration while the SPA is mounted", async () => {
    const view = render(<App />);
    await screen.findByText("Home page");
    expect(window.history.scrollRestoration).toBe("manual");

    view.unmount();
    expect(window.history.scrollRestoration).toBe("auto");
  });
});
