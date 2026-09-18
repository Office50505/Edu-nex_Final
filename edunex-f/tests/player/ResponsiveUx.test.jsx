import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LegalLayout } from "../../src/components/legal/LegalLayout.jsx";

const appStyles = readFileSync(new URL("../../src/styles/app.css", import.meta.url), "utf8");
const legalStyles = readFileSync(new URL("../../src/components/legal/LegalPages.css", import.meta.url), "utf8");

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
});
