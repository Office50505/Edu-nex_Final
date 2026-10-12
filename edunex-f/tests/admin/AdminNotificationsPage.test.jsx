// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { AdminNotificationsPage } from "../../src/pages/admin/AdminNotificationsPage.jsx";
import { adminJson } from "../../src/pages/admin/adminApi.js";
import { renderAdmin } from "../helpers/adminRender.jsx";

vi.mock("../../src/pages/admin/adminApi.js", async (importOriginal) => ({
  ...await importOriginal(),
  adminJson: vi.fn(),
  requireAdmin: () => true,
}));

beforeEach(() => {
  localStorage.clear();
  adminJson.mockReset();
  vi.stubGlobal("confirm", vi.fn(() => true));
  adminJson.mockImplementation(async (path) => {
    if (path.startsWith("/api/admin/notifications/broadcasts")) {
      return { audiences: { all: 13, learners: 11, testers: 2 }, broadcasts: [] };
    }
    if (path === "/api/admin/notifications/broadcast") {
      return {
        message: "Notification sent to 2 active accounts.",
        broadcast: {
          id: "broadcast-1",
          title: "Tester release",
          body: "Please verify the latest learning flow.",
          type: "learning",
          audience: "testers",
          recipientCount: 2,
          status: "sent",
          createdAt: "2026-10-07T10:00:00.000Z",
        },
      };
    }
    return {};
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("composes and sends a targeted notification broadcast", async () => {
  renderAdmin(<AdminNotificationsPage />);
  expect(await screen.findByText("Automatic course updates are on")).toBeTruthy();

  fireEvent.change(screen.getByLabelText("Audience"), { target: { value: "testers" } });
  fireEvent.change(screen.getByLabelText("Notification type"), { target: { value: "learning" } });
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Tester release" } });
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Please verify the latest learning flow." } });
  fireEvent.click(screen.getByRole("button", { name: "Send broadcast" }));

  expect(await screen.findByText("Notification sent to 2 active accounts.")).toBeTruthy();
  expect(confirm).toHaveBeenCalledWith("Send “Tester release” to 2 active accounts?");
  expect(adminJson).toHaveBeenCalledWith(
    "/api/admin/notifications/broadcast",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        audience: "testers",
        type: "learning",
        title: "Tester release",
        body: "Please verify the latest learning flow.",
      }),
    }),
    "Unable to broadcast the notification."
  );
});
