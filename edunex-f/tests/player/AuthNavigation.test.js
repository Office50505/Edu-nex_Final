import { describe, expect, it } from "vitest";
import { safeAuthReturnPath } from "../../src/lib/authNavigation.js";

describe("post-auth navigation", () => {
  const origin = "https://skillomate.in";

  it("opens home when login or signup has no requested destination", () => {
    expect(safeAuthReturnPath(null, origin, "/")).toBe("/");
    expect(safeAuthReturnPath("", origin, "/")).toBe("/");
  });

  it("returns users to the protected page they originally requested", () => {
    expect(safeAuthReturnPath("/dashboard", origin, "/")).toBe("/dashboard");
    expect(safeAuthReturnPath("/ai?chat=new#composer", origin, "/")).toBe("/ai?chat=new#composer");
  });

  it("rejects external and malformed return destinations", () => {
    expect(safeAuthReturnPath("https://evil.example/steal", origin, "/")).toBe("/");
    expect(safeAuthReturnPath("//evil.example/steal", origin, "/")).toBe("/");
    expect(safeAuthReturnPath("http://[invalid", origin, "/")).toBe("/");
  });
});
