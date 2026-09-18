import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const widgetSource = readFileSync(new URL("../../js/nex-ai-widget.js", import.meta.url), "utf8");

describe("responsive AI widget setup", () => {
  it("keeps the robot avatar fixed and only asks the learner to choose a name", () => {
    expect(widgetSource).toContain("<h3>Name your AI</h3>");
    expect(widgetSource).toContain("Your Skillomate robot avatar is fixed.");
    expect(widgetSource).not.toContain('id="nai-setup-avatars"');
    expect(widgetSource).not.toContain('id="nai-avatar-menu"');
    expect(widgetSource).not.toContain("Choose AI style");
    expect(widgetSource).not.toContain("edunexAiBotAvatar");
  });
});
