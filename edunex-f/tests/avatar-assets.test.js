import { describe, expect, it } from "vitest";
import {
  APP_PROFILE_AVATARS,
  normalizeProfileAvatarPath,
  profileAvatarSrc,
} from "../src/lib/avatarAssets.js";

describe("cross-platform profile avatar resolution", () => {
  it("maps the mobile a2 ID to the matching web-served asset", () => {
    expect(normalizeProfileAvatarPath("a2")).toBe("assets/avatars/a2.jpeg");
    expect(profileAvatarSrc("a2")).toBe("/assets/avatars/a2.jpeg");
  });

  it("maps mobile gender aliases to the same canonical app assets", () => {
    expect(normalizeProfileAvatarPath("m1")).toBe("assets/avatars/a2.jpeg");
    expect(normalizeProfileAvatarPath("f6")).toBe("assets/avatars/a13.jpeg");
  });

  it("keeps existing web avatar paths compatible", () => {
    expect(normalizeProfileAvatarPath("assets/avatars/male2-v1.webp"))
      .toBe("assets/avatars/male2-v1.webp");
    expect(normalizeProfileAvatarPath("assets/male2.jpeg"))
      .toBe("assets/avatars/male2-v1.webp");
  });

  it("exposes every app avatar asset to the web picker", () => {
    expect(APP_PROFILE_AVATARS).toHaveLength(15);
    expect(APP_PROFILE_AVATARS).toContain("assets/avatars/a15.jpeg");
  });
});
