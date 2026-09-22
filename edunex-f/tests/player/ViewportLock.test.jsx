// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { resetViewportLocks, useViewportLock } from "../../src/hooks/useViewportLock.js";

function LockHarness({ active }) {
  useViewportLock(active);
  return <div>Modal content</div>;
}

afterEach(() => {
  cleanup();
  resetViewportLocks();
  vi.restoreAllMocks();
});

describe("modal viewport locking", () => {
  it("keeps the document scrollable while a modal is open", () => {
    const view = render(<LockHarness active />);

    expect(document.documentElement.style.overflow).toBe("");
    expect(document.body.style.position).toBe("");
    expect(document.body.classList.contains("has-viewport-lock")).toBe(false);

    view.rerender(<LockHarness active={false} />);

    expect(document.documentElement.style.overflow).toBe("");
    expect(document.body.style.position).toBe("");
    expect(document.body.classList.contains("has-viewport-lock")).toBe(false);
  });

  it("recovers orphaned inline lock styles left by an older page", () => {
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.body.style.position = "fixed";
    document.body.style.top = "-320px";
    document.body.style.left = "0px";
    document.body.style.right = "0px";
    document.body.style.width = "100%";

    resetViewportLocks();

    expect(document.documentElement.style.overflow).toBe("");
    expect(document.body.style.overflow).toBe("");
    expect(document.body.style.position).toBe("");
    expect(document.body.style.top).toBe("");
    expect(document.body.style.width).toBe("");
  });
});
