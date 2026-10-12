// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLearningProgress } from "../../src/hooks/useLearningProgress.js";

const status = {
  lessons: [{ id: "lesson-1", complete: false, watchedSeconds: 0, duration: 100, resumePosition: 0 }],
  completedLessons: 0,
  totalLessons: 1,
  progressPercent: 0,
};

function ProgressHarness({ current, duration = 100, playing }) {
  useLearningProgress("course-1", "lesson-1", { current, duration }, playing);
  return null;
}

describe("learning progress heartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    window.EduNex = {
      getUser: vi.fn(() => ({ _id: "learner-1" })),
      authRequest: vi.fn(async (_path, options) => (
        options?.method === "POST" ? { eligibility: status } : status
      )),
    };
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    delete window.EduNex;
  });

  it("records active viewing, flushes a pause, and does not keep counting while paused", async () => {
    const view = render(<ProgressHarness current={0} playing={false} />);
    await act(async () => {});
    const progressCalls = () => window.EduNex.authRequest.mock.calls.filter(([, options]) => options?.method === "POST");
    expect(progressCalls()).toHaveLength(0);

    view.rerender(<ProgressHarness current={10} playing />);
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(progressCalls()).toHaveLength(1);
    expect(JSON.parse(progressCalls()[0][1].body)).toEqual({ videoId: "lesson-1", currentTime: 10, duration: 100 });

    view.rerender(<ProgressHarness current={20} playing={false} />);
    await act(async () => {});
    expect(progressCalls()).toHaveLength(2);
    expect(JSON.parse(progressCalls()[1][1].body).currentTime).toBe(20);

    await act(async () => { vi.advanceTimersByTime(15000); });
    expect(progressCalls()).toHaveLength(2);
  });

  it("queues the latest pause position when a heartbeat request is still in flight", async () => {
    let resolveHeartbeat;
    window.EduNex.authRequest.mockImplementation(async (_path, options) => {
      if (options?.method !== "POST") return status;
      if (!resolveHeartbeat) return new Promise((resolve) => { resolveHeartbeat = resolve; });
      return { eligibility: status };
    });
    const view = render(<ProgressHarness current={10} playing />);
    await act(async () => {});
    await act(async () => { vi.advanceTimersByTime(5000); });

    view.rerender(<ProgressHarness current={20} playing={false} />);
    await act(async () => {});
    expect(window.EduNex.authRequest.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);

    await act(async () => { resolveHeartbeat({ eligibility: status }); });
    const progressCalls = window.EduNex.authRequest.mock.calls.filter(([, options]) => options?.method === "POST");
    expect(progressCalls).toHaveLength(2);
    expect(JSON.parse(progressCalls[1][1].body).currentTime).toBe(20);
  });
});
