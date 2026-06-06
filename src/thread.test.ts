import { describe, expect, it } from "vitest";
import type { SpokeReply } from "./api";
import { addReplyToPost, displayNameForReply } from "./thread";

function reply(overrides: Partial<SpokeReply>): SpokeReply {
  return {
    schema: "spoke.reply.v1",
    id: "reply_1",
    sender: "bob.jolt",
    postAuthor: "alice.jolt",
    postAddress: "alice.jolt/spoke/posts/post_1",
    body: "Hello",
    createdAt: "2026-06-06T10:00:00.000Z",
    ...overrides
  };
}

describe("Spoke thread helpers", () => {
  it("groups accepted replies under their post address in conversation order", () => {
    const first = reply({ id: "reply_1", body: "First", createdAt: "2026-06-06T10:00:00.000Z" });
    const second = reply({ id: "reply_2", body: "Second", createdAt: "2026-06-06T10:01:00.000Z" });

    const result = addReplyToPost(addReplyToPost({}, second), first);

    expect(result["alice.jolt/spoke/posts/post_1"].map((item) => item.body)).toEqual([
      "First",
      "Second"
    ]);
  });

  it("replaces an existing reply with the same id", () => {
    const original = reply({ id: "reply_1", body: "Original" });
    const edited = reply({ id: "reply_1", body: "Edited" });

    const result = addReplyToPost(addReplyToPost({}, original), edited);

    expect(result["alice.jolt/spoke/posts/post_1"]).toEqual([edited]);
  });

  it("uses contact names when rendering reply senders", () => {
    expect(
      displayNameForReply(
        reply({ sender: "bob.jolt" }),
        [{ identity: "bob.jolt", displayName: "Bob" }],
        "alice.jolt",
        "Alice"
      )
    ).toBe("Bob");
  });

  it("uses contact names when reply senders are bare daemon identity IDs", () => {
    expect(
      displayNameForReply(
        reply({ sender: "bob" }),
        [{ identity: "bob.jolt", displayName: "Bob" }],
        "alice.jolt",
        "Alice"
      )
    ).toBe("Bob");
  });

  it("uses the local profile name for local replies", () => {
    expect(
      displayNameForReply(
        reply({ sender: "alice.jolt" }),
        [{ identity: "bob.jolt", displayName: "Bob" }],
        "alice.jolt",
        "Alice"
      )
    ).toBe("Alice");
  });
});
