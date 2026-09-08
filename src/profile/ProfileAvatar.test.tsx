// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ProfileAvatar, ProfileAvatarsProvider } from "./ProfileAvatar";
import { AVATAR_REFRESH_MS } from "./avatars";

beforeEach(() => {
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:portrait"), revokeObjectURL: vi.fn() });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("keeps initials on image decode failure and releases image URLs on unmount", async () => {
  const source = { load: vi.fn().mockResolvedValue(new Blob(["photo"])), invalidate: vi.fn() };
  const view = render(
    <ProfileAvatarsProvider source={source}>
      <ProfileAvatar identity="bob.jolt" name="Bob" />
    </ProfileAvatarsProvider>
  );
  fireEvent.error(await screen.findByAltText("Bob profile picture"));
  expect(screen.getByText("B")).toBeVisible();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:portrait");
});

it("does not show a previous person's picture after an identity change or late completion", async () => {
  let finish!: (blob: Blob) => void;
  const source = {
    load: vi.fn().mockImplementation((identity: string) =>
      identity === "bob"
        ? new Promise<Blob>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(null)
    ),
    invalidate: vi.fn()
  };
  const picture = (identity: string, name: string) => (
    <ProfileAvatarsProvider source={source}>
      <ProfileAvatar identity={identity} name={name} />
    </ProfileAvatarsProvider>
  );
  const view = render(picture("bob", "Bob"));
  view.rerender(picture("carol", "Carol"));
  await act(async () => finish(new Blob(["Bob's portrait"])));
  expect(screen.getByText("C")).toBeVisible();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it("retries while mounted and stops refreshing when removed", async () => {
  vi.useFakeTimers();
  const source = {
    load: vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValue(new Blob(["photo"])),
    invalidate: vi.fn()
  };
  const view = render(
    <ProfileAvatarsProvider source={source}>
      <ProfileAvatar identity="bob" name="Bob" />
    </ProfileAvatarsProvider>
  );
  await act(async () => {});
  expect(screen.getByText("B")).toBeVisible();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(AVATAR_REFRESH_MS);
  });
  expect(screen.getByAltText("Bob profile picture")).toBeVisible();
  view.unmount();
  await vi.advanceTimersByTimeAsync(AVATAR_REFRESH_MS * 2);
  expect(source.load).toHaveBeenCalledTimes(2);
});
