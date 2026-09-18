import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appStyles = readFileSync(new URL("../../src/styles/app.css", import.meta.url), "utf8");

describe("AI tutor message contrast", () => {
  it("keeps conversation text readable in both themes after global paragraph rules", () => {
    expect(appStyles).toMatch(/html\[data-theme="light"\][\s\S]*chat-bubble\.user[\s\S]*color: #0F172A !important;/);
    expect(appStyles).toMatch(/html:not\(\[data-theme="light"\]\)[\s\S]*chat-bubble\.ai[\s\S]*color: #F8FAFC !important;/);
    expect(appStyles).toMatch(/html:not\(\[data-theme="light"\]\)[\s\S]*chat-bubble\.user[\s\S]*color: #0A0C12 !important;/);
  });
});
