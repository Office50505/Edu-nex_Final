// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(async () => {
  const meta = document.createElement("meta");
  meta.name = "skillomate-api-base-url";
  meta.content = "https://api.skillomate.in/";
  document.head.appendChild(meta);
  window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  await import("../../js/edunex-api.js");
});

afterAll(() => {
  document.querySelector('meta[name="skillomate-api-base-url"]')?.remove();
  delete window.EduNex;
  vi.restoreAllMocks();
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("production API routing", () => {
  it.each([
    ["/api/courses", "https://api.skillomate.in/api/courses"],
    ["api/courses", "https://api.skillomate.in/api/courses"],
    ["/courses", "https://api.skillomate.in/api/courses"],
    ["/api/login", "https://api.skillomate.in/api/login"],
    ["/api/signup", "https://api.skillomate.in/api/signup"],
  ])("normalizes %s without duplicating /api", (input, expected) => {
    expect(window.EduNex.apiUrl(input)).toBe(expected);
  });

  it("preserves an already absolute URL", () => {
    expect(window.EduNex.apiUrl("https://cdn.example.test/media.m3u8"))
      .toBe("https://cdn.example.test/media.m3u8");
  });

  it("keeps bearer authentication while sending to the production API origin", async () => {
    localStorage.setItem("edunexAccessToken", "access-token");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await window.EduNex.authRequest("/api/auth/me");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.skillomate.in/api/auth/me",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer access-token" }) }),
    );
  });
});
