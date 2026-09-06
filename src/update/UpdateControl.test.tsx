// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UpdateControl } from "./UpdateControl";
afterEach(cleanup);
it("checks for a compatible update and installs only on explicit action", async () => {
  const client = {
    check: vi.fn().mockResolvedValue({
      available: true,
      version: "1.0",
      compatibility: { status: "compatible" }
    }),
    installAndRelaunch: vi.fn().mockResolvedValue(undefined)
  };
  render(<UpdateControl client={client} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Check for updates" }));
  expect(await screen.findByText("Update available: 1.0")).toBeVisible();
  expect(client.installAndRelaunch).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Install and restart" }));
  expect(client.installAndRelaunch).toHaveBeenCalledOnce();
});
it("explains incompatible updates and does not offer installation", async () => {
  const client = {
    check: vi.fn().mockResolvedValue({
      available: true,
      version: "1.0",
      compatibility: { status: "incompatible" }
    }),
    installAndRelaunch: vi.fn()
  };
  render(<UpdateControl client={client} />);
  await userEvent.setup().click(screen.getByRole("button", { name: "Check for updates" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Update Jolt before installing");
  expect(screen.queryByRole("button", { name: "Install and restart" })).not.toBeInTheDocument();
});
