// @vitest-environment jsdom
import { fireEvent, waitFor } from "@testing-library/dom";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  document.getElementById("nex-ai-widget-root")?.remove();
  document.getElementById("nex-ai-widget-styles")?.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("fits the first-time AI setup and chat flow when opened from the mobile video player", async () => {
  localStorage.clear();
  const mediaQuery = {
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  };
  vi.stubGlobal("matchMedia", vi.fn(() => mediaQuery));
  vi.stubGlobal("scrollTo", vi.fn());

  const visualViewport = new EventTarget();
  Object.defineProperties(visualViewport, {
    height: { configurable: true, writable: true, value: 720 },
    width: { configurable: true, writable: true, value: 390 },
    offsetTop: { configurable: true, writable: true, value: 0 },
    offsetLeft: { configurable: true, writable: true, value: 0 },
  });
  Object.defineProperty(window, "visualViewport", { configurable: true, value: visualViewport });

  const api = {
    getAccessToken: vi.fn(() => "active-token"),
    getUser: vi.fn(() => ({ _id: "learner-1", fullName: "Learner" })),
    authRequest: vi.fn(async () => ({ reply: "Hello! How can I help?" })),
  };
  window.EduNex = api;
  vi.stubGlobal("EduNex", api);

  const playerFrame = document.createElement("div");
  playerFrame.id = "playerFrame";
  document.body.appendChild(playerFrame);

  await import("../../js/nex-ai-widget.js");
  window.NexAIWidget.open(playerFrame);

  const root = document.getElementById("nex-ai-widget-root");
  const overlay = document.getElementById("nai-overlay");
  expect(root.parentElement).toBe(document.body);
  expect(overlay.classList.contains("nai-open")).toBe(true);
  expect(root.style.getPropertyValue("--nai-viewport-height")).toBe("720px");
  expect(root.style.getPropertyValue("--nai-viewport-width")).toBe("390px");

  const setupName = document.getElementById("nai-setup-name");
  fireEvent.input(setupName, { target: { value: "Ash" } });
  fireEvent.click(document.getElementById("nai-setup-save"));
  expect(document.getElementById("nai-setup-panel").hidden).toBe(true);

  fireEvent.input(document.getElementById("nai-input"), { target: { value: "Hie" } });
  fireEvent.click(document.getElementById("nai-send"));
  await waitFor(() => expect(document.getElementById("nai-messages").textContent).toContain("Hello! How can I help?"));
  expect(api.authRequest).toHaveBeenCalledWith("/api/ai/chat", expect.any(Object));

  visualViewport.height = 480;
  visualViewport.width = 320;
  visualViewport.offsetLeft = 12;
  visualViewport.dispatchEvent(new Event("resize"));
  expect(root.style.getPropertyValue("--nai-viewport-height")).toBe("480px");
  expect(root.style.getPropertyValue("--nai-viewport-width")).toBe("320px");
  expect(root.style.getPropertyValue("--nai-viewport-left")).toBe("12px");
});
