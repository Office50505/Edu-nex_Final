// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditProfilePage } from "../../src/pages/EditProfilePage.jsx";

vi.mock("../../src/legacyRuntime.js", () => ({ runLegacyPage: () => () => {} }));
vi.mock("../../src/hooks/usePageStyle.js", () => ({ usePageStyle: () => {} }));

const user = {
  _id: "user-1",
  fullName: "Aarav Learner",
  email: "aarav@example.com",
  mobileNumber: "919827843256",
  age: 18,
  gender: "male",
  avatar: "assets/male1.jpeg",
};

let assign;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("edunexAccessToken", "active-token");
  localStorage.setItem("edunexUser", JSON.stringify(user));
  assign = vi.fn();
  const originalWindow = window;
  vi.stubGlobal("window", new Proxy(originalWindow, {
    get(target, key) {
      return key === "location" ? { ...target.location, assign } : Reflect.get(target, key);
    },
  }));
  window.EduNex = {
    request: vi.fn(),
    getAccessToken: vi.fn(() => "active-token"),
    getUser: vi.fn(() => user),
    renderUserAvatar: vi.fn(),
    authRequest: vi.fn(async (_url, options) => ({ user: options?.method === "PATCH" ? { ...user, fullName: "Aarav Updated" } : user })),
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("returns to the profile page only after profile changes save successfully", async () => {
  render(<EditProfilePage />);
  await screen.findByDisplayValue("Aarav");

  fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Aarav" } });
  fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: "Updated" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

  await waitFor(() => expect(assign).toHaveBeenCalledWith("/profile"));
  const saveRequest = window.EduNex.authRequest.mock.calls.find(([, options]) => options?.method === "PATCH");
  expect(JSON.parse(saveRequest[1].body).fullName).toBe("Aarav Updated");
});

it("stays on the edit form when validation fails", async () => {
  render(<EditProfilePage />);
  await screen.findByDisplayValue("Aarav");

  fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

  expect(assign).not.toHaveBeenCalled();
  expect(window.EduNex.authRequest.mock.calls.some(([, options]) => options?.method === "PATCH")).toBe(false);
});
