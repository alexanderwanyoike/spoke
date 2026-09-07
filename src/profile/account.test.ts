import { expect, it, vi } from "vitest";
import { loadAccountName } from "./account";
import type { ProfileReader } from "./loaders";

function profileReader(value: unknown) {
  const reader: ProfileReader = {
    async read(ref, decode) {
      const profile = decode(value);
      return profile === null
        ? null
        : { ref, value: profile, latestSequence: 1, contentId: "profile-cid" };
    }
  };
  vi.spyOn(reader, "read");
  return reader;
}

const profile = {
  schema: "spoke.profile.v1",
  identity: "alice.jolt",
  displayName: "  Alice Jones  ",
  bio: "",
  updatedAt: "2026-09-07T00:00:00Z"
};

it("reads the saved account profile through the SDK", async () => {
  const reader = profileReader(profile);
  expect(await loadAccountName(reader, "alice")).toBe("Alice Jones");
  expect(reader.read).toHaveBeenCalledWith(
    { identity: "alice", path: "/spoke/profile" },
    expect.any(Function)
  );
});

it.each([null, {}, { ...profile, displayName: "   " }, { ...profile, identity: "bob.jolt" }])(
  "does not use a missing, invalid, blank or different owner's profile",
  async (value) => {
    expect(await loadAccountName(profileReader(value), "alice")).toBeNull();
  }
);

it("rejects malformed profile fields before they reach the UI", async () => {
  expect(
    await loadAccountName(
      profileReader({ schema: "spoke.profile.v2", identity: "alice", displayName: 42 }),
      "alice"
    )
  ).toBeNull();
});
