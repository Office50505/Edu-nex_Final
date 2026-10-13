import { describe, expect, it } from "vitest";
import { canOpenCourseForAccess, normalizeAccessPhase, primaryTrialCourseId } from "../../src/lib/courseAccess.js";

const courses = [
  { _id: "film", title: "AI Film Making Course", slug: "ai-film-making" },
  { _id: "influencer", title: "AI Influencer Course", slug: "ai-influencer" },
];

describe("shared course access rules", () => {
  it("recognizes an active ₹1 trial without upgrading it to full access", () => {
    expect(normalizeAccessPhase({
      subscriptionDocStatus: "1rs trial",
      trialExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      accessGranted: true,
    })).toBe("trial");
  });

  it("uses the API's computed active status when the stored subscription document is expired", () => {
    expect(normalizeAccessPhase({
      status: "active",
      subscriptionStatus: "active",
      subscriptionDocStatus: "expired",
      hasActiveAccess: true,
    })).toBe("full");
  });

  it("allows only the primary trial course during a trial", () => {
    const trialCourseId = primaryTrialCourseId(courses);
    const context = { accessPhase: "trial", courseAccessIds: new Set(), trialCourseId };
    expect(trialCourseId).toBe("influencer");
    expect(canOpenCourseForAccess(courses[1], context)).toBe(true);
    expect(canOpenCourseForAccess(courses[0], context)).toBe(false);
  });

  it("allows every course after full subscription access activates", () => {
    const context = { accessPhase: "full", courseAccessIds: new Set(), trialCourseId: "influencer" };
    expect(courses.every((course) => canOpenCourseForAccess(course, context))).toBe(true);
  });
});
