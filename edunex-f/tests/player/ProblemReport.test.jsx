// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProblemReport } from "../../src/components/ProblemReport.jsx";
import { Navbar } from "../../src/components/Navbar.jsx";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/course?courseId=course-12&token=never-store-this");
  document.documentElement.dataset.theme = "light";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete window.EduNex;
});

describe("problem reporting", () => {
  it("submits the report with safe page context and shows its reference", async () => {
    localStorage.setItem("edunexAccessToken", "learner-token");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ reportId: "RPT-20260918-ABC12345", status: "new" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ProblemReport open onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Where is the problem?"), { target: { value: "video" } });
    fireEvent.change(screen.getByPlaceholderText("Describe what you were trying to do and what happened instead..."), { target: { value: "The lesson video remains blank after I press play." } });
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));

    await screen.findByText("RPT-20260918-ABC12345");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);
    expect(path).toBe("/api/problem-reports");
    expect(request.headers.Authorization).toBe("Bearer learner-token");
    expect(body.category).toBe("video");
    expect(body.courseId).toBe("course-12");
    expect(body.pageUrl).toContain("courseId=course-12");
    expect(body.pageUrl).not.toContain("never-store-this");
  });

  it("keeps the mobile navigation at five items and provides a separate report trigger", () => {
    const onReport = vi.fn();
    render(<Navbar pageKey="index.html" onReportProblem={onReport} />);
    expect(document.querySelectorAll(".enx-mobile-footer-link")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Report a problem" }));
    expect(onReport).toHaveBeenCalledTimes(1);
  });

  it("validates useful detail before sending", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ProblemReport open onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText("Describe what you were trying to do and what happened instead...");
    fireEvent.change(input, { target: { value: "Too short" } });
    fireEvent.submit(input.closest("form"));
    expect((await screen.findByRole("alert")).textContent).toContain("at least 10 characters");
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });
});
