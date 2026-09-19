import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appStyles = readFileSync(new URL("../../src/styles/app.css", import.meta.url), "utf8");

describe("light theme contrast guards", () => {
  it("uses dark foregrounds on legacy panels that become white", () => {
    expect(appStyles).toMatch(/data-page="videos\.html"[\s\S]*\.summary-number[\s\S]*color: #0F172A !important;/);
    expect(appStyles).toMatch(/data-page="edit-profile\.html"[\s\S]*\.ava-edit-name[\s\S]*color: #0F172A !important;/);
    expect(appStyles).toMatch(/data-page="lesson\.html"[\s\S]*\.cc-title[\s\S]*\.msg-ai-text[\s\S]*color: #0F172A !important;/);
  });

  it("preserves white foregrounds on intentionally dark media surfaces", () => {
    expect(appStyles).toMatch(/\.bento-card[\s\S]*\.featured-course[\s\S]*\.course-thumb-wrap[\s\S]*color: #FFFFFF !important;/);
  });

  it("keeps Chrome autofilled login fields light and readable in light theme", () => {
    expect(appStyles).toMatch(/html\[data-theme="light"\][\s\S]*data-page="login\.html"[\s\S]*input:-webkit-autofill[\s\S]*-webkit-text-fill-color: #0F172A !important;[\s\S]*-webkit-box-shadow: 0 0 0 1000px #F8FAFC inset !important;/);
    expect(appStyles).toMatch(/html\[data-theme="light"\][\s\S]*data-page="login\.html"[\s\S]*input:autofill/);
  });
});
