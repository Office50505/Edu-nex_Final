// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useViewportLock } from "../../src/hooks/useViewportLock.js";

function LockHarness({ active }) {
  useViewportLock(active);
  return <div>Modal content</div>;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("modal viewport locking", () => {
  it("fixes the background in place and restores it when the window closes", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    Object.defineProperty(window, "scrollY", { configurable: true, value: 240 });

    const view = render(<LockHarness active />);

    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.top).toBe("-240px");
    expect(document.body.style.width).toBe("100%");
    expect(document.body.classList.contains("has-viewport-lock")).toBe(true);

    view.rerender(<LockHarness active={false} />);

    expect(document.documentElement.style.overflow).toBe("");
    expect(document.body.style.position).toBe("");
    expect(document.body.classList.contains("has-viewport-lock")).toBe(false);
    expect(scrollTo).toHaveBeenCalledWith({ top: 240, left: 0, behavior: "auto" });
  });
});
