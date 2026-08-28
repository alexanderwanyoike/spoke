import { describe, expect, it } from "vitest";
import { State } from "jolt-sdk/data";

import { SpokeData } from "./data";

describe("Spoke Data SDK application", () => {
  it("keeps a stable profile reference and independent mutable post references", async () => {
    const spoke = SpokeData.test({ identity: "alice.jolt" });
    const createdProfile = await spoke.profile.getOrCreate({
      identity: "alice.jolt",
      displayName: "Alice",
      bio: "Building Jolt",
      updatedAt: new Date("2026-08-28T12:00:00.000Z"),
    });
    const updatedProfile = await createdProfile.update({
      bio: "Building Spoke on Jolt",
      updatedAt: new Date("2026-08-28T12:05:00.000Z"),
    });

    expect(updatedProfile.ref).toEqual(createdProfile.ref);
    expect(updatedProfile.ref).toEqual({
      identity: "alice.jolt",
      path: "/spoke/profile",
    });

    const first = await spoke.posts.create({
      author: "alice.jolt",
      title: "Hello",
      body: "First post",
      createdAt: new Date("2026-08-28T12:10:00.000Z"),
    });
    const second = await spoke.posts.create({
      author: "alice.jolt",
      title: "Again",
      body: "Second post",
      createdAt: new Date("2026-08-28T12:11:00.000Z"),
    });
    const edited = await first.update({ body: "Edited first post" });
    const deleted = await second.delete();
    const restored = await deleted.restore({
      author: "alice.jolt",
      title: "Again",
      body: "Restored second post",
      createdAt: new Date("2026-08-28T12:11:00.000Z"),
    });

    expect(first.ref).not.toEqual(second.ref);
    expect(edited.ref).toEqual(first.ref);
    expect(restored.ref).toEqual(second.ref);
    expect(edited.value.body).toBe("Edited first post");
    expect(restored.state).toBe(State.Present);
  });
});
