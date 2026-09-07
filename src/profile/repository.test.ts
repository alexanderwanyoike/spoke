import { expect, it, vi } from "vitest";
import { createProfileRepository } from "./repository";
import type { JoltSdk } from "../jolt";

it("refuses a save when the saved profile changed during editing", async () => {
  const sdk = {
    read: vi.fn().mockResolvedValue({
      contentId: "newer",
      value: { schema: "spoke.profile.v2", identity: "alice", displayName: "Alice" }
    }),
    readRecord: vi.fn(),
    publishJson: vi.fn(),
    updateRecord: vi.fn()
  };
  const repository = createProfileRepository("alice", sdk as unknown as JoltSdk);
  await expect(
    repository.save(
      { displayName: "Changed", bio: "", location: "", pronouns: "", website: "" },
      "older"
    )
  ).rejects.toThrow(/changed/);
  expect(sdk.publishJson).not.toHaveBeenCalled();
  expect(sdk.updateRecord).not.toHaveBeenCalled();
});

it("updates a profile with the authoritative revision instead of a blind publish", async () => {
  const value = {
    schema: "spoke.profile.v2",
    identity: "alice",
    displayName: "Alice",
    bio: "",
    updatedAt: "2026-09-07T00:00:00Z"
  };
  const sdk = {
    read: vi.fn().mockResolvedValue({ contentId: "original", value }),
    readRecord: vi
      .fn()
      .mockResolvedValue({ state: "present", contentId: "original", revision: "revision-1" }),
    updateRecord: vi.fn().mockResolvedValue({ contentId: "saved" }),
    publishJson: vi.fn()
  };
  const repository = createProfileRepository("alice", sdk as unknown as JoltSdk);
  const saved = await repository.save(
    {
      displayName: "Alice Jones",
      bio: "",
      location: "",
      pronouns: "",
      website: "https://example.com"
    },
    "original"
  );
  expect(saved.profile?.displayName).toBe("Alice Jones");
  expect(sdk.updateRecord).toHaveBeenCalledWith(
    { identity: "alice", path: "/spoke/profile" },
    expect.objectContaining({ displayName: "Alice Jones" }),
    expect.objectContaining({ revision: "revision-1" })
  );
  expect(sdk.publishJson).not.toHaveBeenCalled();
});
