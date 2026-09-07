// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom/vitest";
import { ProfilePage } from "./ProfilePage";

const snapshot = {
  contentId: "original",
  profile: {
    schema: "spoke.profile.v2" as const,
    identity: "alice",
    displayName: "Alice",
    bio: "Hello",
    updatedAt: "2026-09-07T00:00:00Z"
  }
};
afterEach(cleanup);
it("keeps an edited profile draft after a failed save", async () => {
  const gateway = {
    load: vi.fn().mockResolvedValue(snapshot),
    save: vi.fn().mockRejectedValue(new Error("Offline"))
  };
  render(
    <MemoryRouter>
      <ProfilePage identity="alice" gateway={gateway} onSaved={vi.fn()} />
    </MemoryRouter>
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Edit profile" }));
  const name = screen.getByRole("textbox", { name: "Display name" });
  await user.clear(name);
  await user.type(name, "Alice Jones");
  await user.click(screen.getByRole("button", { name: "Save profile" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
  expect(name).toHaveValue("Alice Jones");
  expect(gateway.save).toHaveBeenCalledWith(
    expect.objectContaining({ displayName: "Alice Jones" }),
    "original",
    undefined
  );
});

it("passes the selected profile picture through the save workflow", async () => {
  const gateway = {
    load: vi.fn().mockResolvedValue(snapshot),
    save: vi.fn().mockResolvedValue(snapshot)
  };
  render(
    <MemoryRouter>
      <ProfilePage identity="alice" gateway={gateway} onSaved={vi.fn()} />
    </MemoryRouter>
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Edit profile" }));
  const photo = new File(["photo"], "portrait.png", { type: "image/png" });
  await user.upload(screen.getByLabelText("Profile picture"), photo);
  await user.click(screen.getByRole("button", { name: "Save profile" }));
  expect(gateway.save).toHaveBeenCalledWith(expect.anything(), "original", photo);
});
