// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdminLoginPage } from "../../src/pages/admin/AdminLoginPage.jsx";

beforeEach(() => {
  delete window.EduNex;
  const meta = document.createElement("meta");
  meta.name = "skillomate-api-base-url";
  meta.content = "https://api.skillomate.in/";
  document.head.appendChild(meta);
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  document.querySelector('meta[name="skillomate-api-base-url"]')?.remove();
  delete window.EduNex;
  vi.unstubAllGlobals();
});

it("submits standalone admin credentials to the configured backend", async () => {
  const fetchMock = vi.fn(async () => new Response(
    JSON.stringify({ error: "Invalid username or password." }),
    { status: 401, headers: { "content-type": "application/json" } },
  ));
  vi.stubGlobal("fetch", fetchMock);

  render(<AdminLoginPage />);
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "test-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Log in" }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  expect(fetchMock).toHaveBeenCalledWith(
    "https://api.skillomate.in/api/admin/login",
    expect.objectContaining({ method: "POST" }),
  );
  expect((await screen.findByRole("status")).textContent)
    .toBe("Invalid username or password.");
});
