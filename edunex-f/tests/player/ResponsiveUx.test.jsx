import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LegalLayout } from "../../src/components/legal/LegalLayout.jsx";

const appStyles = readFileSync(new URL("../../src/styles/app.css", import.meta.url), "utf8");
const legalStyles = readFileSync(new URL("../../src/components/legal/LegalPages.css", import.meta.url), "utf8");
const homePageSource = readFileSync(new URL("../../src/pages/HomePage.jsx", import.meta.url), "utf8");
const videosPageSource = readFileSync(new URL("../../src/pages/VideosPage.jsx", import.meta.url), "utf8");

describe("cross-viewport UX", () => {
  it("exposes the page key used by route-specific responsive rules", () => {
    const markup = renderToStaticMarkup(<LegalLayout title="Pricing" pageKey="pricing.html">Plans</LegalLayout>);
    expect(markup).toContain('data-page="pricing.html"');
  });

  it("stacks pricing cards before tablet cards become cramped", () => {
    expect(legalStyles).toMatch(/@media \(max-width: 840px\)[\s\S]*\.pricing-plan-grid[\s\S]*grid-template-columns: 1fr;/);
    expect(legalStyles).toMatch(/@media \(max-width: 1180px\)[\s\S]*\.legal-shell[\s\S]*grid-template-columns: 1fr;/);
    expect(legalStyles).toMatch(/@container \(max-width: 720px\)[\s\S]*\.pricing-plan-grid[\s\S]*grid-template-columns: 1fr;/);
  });

  it("contains the AI workspace on tablet, phone, and short viewports", () => {
    expect(appStyles).toMatch(/@media \(min-width: 901px\) and \(max-width: 1200px\)[\s\S]*data-page="ai-tutor\.html"[\s\S]*\.tutor-sidebar/);
    expect(appStyles).toMatch(/@media \(max-width: 520px\)[\s\S]*\.chat-input-area[\s\S]*calc\(100% - 12px\)/);
    expect(appStyles).toMatch(/@media \(max-width: 900px\) and \(max-height: 700px\)[\s\S]*\.tutor-welcome-avatar/);
  });

  it("keeps mobile carousel actions inside the course cards", () => {
    expect(appStyles).toMatch(/@media \(max-width: 760px\)[\s\S]*data-page="index\.html"\] \.hero-course-card[\s\S]*height: 460px !important;/);
  });

  it("keeps both mobile hero typography lines inside the viewport", () => {
    expect(appStyles).toMatch(/@media \(max-width: 700px\)[\s\S]*\.learning-hero-copy[\s\S]*width: 100% !important;[\s\S]*padding-right: 16px !important;/);
    expect(appStyles).toMatch(/@media \(max-width: 700px\)[\s\S]*\.learning-hero h1[\s\S]*font-size: clamp\(24px, 8vw, 32px\) !important;/);
    expect(appStyles).toMatch(/@media \(max-width: 700px\)[\s\S]*\.learning-hero-copy > p[\s\S]*max-width: 340px !important;[\s\S]*overflow-wrap: anywhere !important;/);
  });

  it("groups the mobile lecture drawer into pages of twenty", () => {
    expect(videosPageSource).toContain("const LECTURES_PER_SHEET_PAGE = 20;");
  });

  it("omits the retired skills, modules, and projects homepage sections", () => {
    expect(homePageSource).not.toContain("Explore by Skill");
    expect(homePageSource).not.toContain("View All Skills");
    expect(homePageSource).not.toContain("View Course Curriculum");
    expect(homePageSource).not.toContain("Build These Projects");
    expect(homePageSource).not.toContain("View All Projects");
  });
});
