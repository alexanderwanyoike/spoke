import { describe, expect, it } from "vitest";
import type { SpokeReply, SpokeThreadIndex } from "./api";
import {
  addReplyToPost,
  postIdFromPostAddress,
  threadPathForPostAddress,
  upsertReplyInThreadIndex
} from "./thread";

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

  it("derives stable thread paths from post addresses", () => {
    expect(postIdFromPostAddress("alice.jolt/spoke/posts/post_1")).toBe("post_1");
    expect(threadPathForPostAddress("alice.jolt/spoke/posts/post_1")).toBe(
      "/spoke/threads/post_1"
    );
    expect(() => postIdFromPostAddress("alice.jolt/profile")).toThrow(
      "Reply post address must point at /spoke/posts/."
    );
  });

  it("builds an owner-curated thread index from an accepted reply", () => {
    const result = upsertReplyInThreadIndex(null, reply({ id: "reply_1" }), {
      address: "alice.jolt/spoke/replies/reply_1",
      content_id: "cid_reply_1"
    });

    expect(result).toMatchObject({
      schema: "spoke.thread.v1",
      id: "thread_post_1",
      owner: "alice.jolt",
      postAddress: "alice.jolt/spoke/posts/post_1",
      visibility: "public",
      replies: [
        {
          id: "reply_1",
          sender: "bob.jolt",
          address: "alice.jolt/spoke/replies/reply_1",
          contentId: "cid_reply_1",
          createdAt: "2026-06-06T10:00:00.000Z",
          moderation: "accepted"
        }
      ]
    });
  });

  it("merges accepted replies into a thread index by reply id in conversation order", () => {
    const existing: SpokeThreadIndex = {
      schema: "spoke.thread.v1",
      id: "thread_post_1",
      owner: "alice.jolt",
      postAddress: "alice.jolt/spoke/posts/post_1",
      visibility: "public",
      updatedAt: "2026-06-06T10:03:00.000Z",
      replies: [
        {
          id: "reply_2",
          sender: "carol.jolt",
          address: "alice.jolt/spoke/replies/reply_2_old",
          contentId: "cid_reply_2_old",
          createdAt: "2026-06-06T10:02:00.000Z",
          moderation: "accepted"
        }
      ]
    };

    const result = upsertReplyInThreadIndex(
      upsertReplyInThreadIndex(existing, reply({ id: "reply_1" }), {
        address: "alice.jolt/spoke/replies/reply_1",
        content_id: "cid_reply_1"
      }),
      reply({ id: "reply_2", sender: "carol.jolt", createdAt: "2026-06-06T10:01:00.000Z" }),
      {
        address: "alice.jolt/spoke/replies/reply_2",
        content_id: "cid_reply_2"
      }
    );

    expect(result.replies.map((item) => item.id)).toEqual(["reply_1", "reply_2"]);
    expect(result.replies.find((item) => item.id === "reply_2")?.contentId).toBe("cid_reply_2");
  });
});
