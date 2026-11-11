// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apiUrl } from "../../src/lib/apiUrl.js";

describe("standalone admin API routing", () => {
  beforeEach(() => {
    delete window.EduNex;
    const meta = document.createElement("meta");
    meta.name = "skillomate-api-base-url";
    meta.content = "https://api.skillomate.in/";
    document.head.appendChild(meta);
  });

  afterEach(() => {
    document.querySelector('meta[name="skillomate-api-base-url"]')?.remove();
    delete window.EduNex;
  });

  it("sends admin login to the configured backend when the shared runtime is not loaded", () => {
    expect(apiUrl("/api/admin/login"))
      .toBe("https://api.skillomate.in/api/admin/login");
  });

  it("normalizes API paths and preserves absolute URLs", () => {
    expect(apiUrl("admin/me")).toBe("https://api.skillomate.in/api/admin/me");
    expect(apiUrl("https://cdn.example.test/file.png"))
      .toBe("https://cdn.example.test/file.png");
  });
});
