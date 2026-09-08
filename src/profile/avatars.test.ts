import { afterEach, expect, it, vi } from "vitest";
import { createFakeJolt } from "jolt-sdk/testing";
import { createProfileRepository } from "./repository";
import { createProfileAvatars, AVATAR_REFRESH_MS } from "./avatars";

const avatar = {
  id: "portrait",
  kind: "image" as const,
  contentId: "portrait-cid",
  address: "bob.jolt/spoke/media/portrait",
  mimeType: "image/png" as const,
  size: 20
};
const profile = {
  schema: "spoke.profile.v2",
  identity: "bob.jolt",
  displayName: "Bob",
  bio: "",
  updatedAt: "2026-09-08T00:00:00Z",
  avatar
};
afterEach(() => vi.useRealTimers());
async function fixture() {
  vi.useFakeTimers();
  const node = createFakeJolt("bob.jolt");
  await node.client.publishJson("/spoke/profile", profile);
  const read = vi.spyOn(node.client, "read");
  const photo = new Blob(["portrait"], { type: "image/png" });
  const images = { load: vi.fn().mockResolvedValue(photo), upload: vi.fn() };
  const avatars = createProfileAvatars(createProfileRepository("alice.jolt", node.client, images));
  return { node, read, photo, images, avatars };
}

it("shares profile and picture reads between suffixed and bare identities across screens", async () => {
  const { avatars, photo, read, images } = await fixture();
  expect(await Promise.all([avatars.load("bob"), avatars.load("bob.jolt")])).toEqual([
    photo,
    photo
  ]);
  expect(await avatars.load("bob")).toBe(photo);
  expect(read).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledWith(
    { identity: "bob.jolt", path: "/spoke/profile" },
    expect.any(Function)
  );
  expect(images.load).toHaveBeenCalledExactlyOnceWith(avatar);
});

it("rechecks the profile without downloading unchanged image bytes", async () => {
  const { avatars, read, images } = await fixture();
  await avatars.load("bob");
  vi.advanceTimersByTime(AVATAR_REFRESH_MS);
  await avatars.load("bob");
  expect(read).toHaveBeenCalledTimes(2);
  expect(images.load).toHaveBeenCalledTimes(1);
});

it("retains a known picture through outages, retries failed new pictures, and clears explicit removal", async () => {
  const { avatars, node, read, photo, images } = await fixture();
  await avatars.load("bob");
  read.mockRejectedValueOnce(new Error("Offline"));
  vi.advanceTimersByTime(AVATAR_REFRESH_MS);
  expect(await avatars.load("bob")).toBe(photo);
  await node.client.publishJson("/spoke/profile", {
    ...profile,
    avatar: { ...avatar, contentId: "new-photo" }
  });
  images.load.mockRejectedValueOnce(new Error("Author unavailable"));
  vi.advanceTimersByTime(AVATAR_REFRESH_MS);
  expect(await avatars.load("bob")).toBe(photo);
  const replacement = new Blob(["new portrait"]);
  images.load.mockResolvedValueOnce(replacement);
  vi.advanceTimersByTime(AVATAR_REFRESH_MS);
  expect(await avatars.load("bob")).toBe(replacement);
  await node.client.publishJson("/spoke/profile", { ...profile, avatar: undefined });
  vi.advanceTimersByTime(AVATAR_REFRESH_MS);
  expect(await avatars.load("bob")).toBeNull();
});

it("retries an initially unavailable picture after the refresh interval", async () => {
  const { avatars, images, photo } = await fixture();
  images.load.mockRejectedValueOnce(new Error("Offline"));
  expect(await avatars.load("bob")).toBeNull();
  expect(await avatars.load("bob")).toBeNull();
  expect(images.load).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(AVATAR_REFRESH_MS);
  expect(await avatars.load("bob")).toBe(photo);
});

it("never downloads an avatar from a mismatched profile owner", async () => {
  const { avatars, node, images } = await fixture();
  await node.client.publishJson("/spoke/profile", { ...profile, identity: "mallory.jolt" });
  expect(await avatars.load("bob")).toBeNull();
  expect(images.load).not.toHaveBeenCalled();
});

it("refreshes immediately after a profile edit invalidates the cached picture", async () => {
  const { avatars, node } = await fixture();
  await avatars.load("bob");
  await node.client.publishJson("/spoke/profile", { ...profile, avatar: undefined });
  avatars.invalidate("bob.jolt");
  expect(await avatars.load("bob")).toBeNull();
});

it("does not reuse an in-flight read from before a profile edit", async () => {
  let finish!: (value: { profile: null; contentId: null }) => void;
  const profiles = {
    load: vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      )
      .mockResolvedValue({ profile: null, contentId: null }),
    save: vi.fn()
  };
  const avatars = createProfileAvatars(profiles);
  const oldRead = avatars.load("bob");
  avatars.invalidate("bob.jolt");
  const newRead = avatars.load("bob");
  expect(profiles.load).toHaveBeenCalledTimes(2);
  finish({ profile: null, contentId: null });
  await Promise.all([oldRead, newRead]);
});
