import { describe, expect, it } from "vitest";
import type { SpokeReply, SpokeThreadIndex } from "./api";
import {
  addReplyToPost,
  buildThreadTree,
  createThreadManifest,
  createThreadReply,
  postIdFromPostAddress,
  threadReplyReference,
  threadPathForPostAddress,
  upsertThreadManifestParticipant,
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
  it("lets Bob reply to his own post and then reply to his own reply", () => {
    const first = createThreadReply({
      id: "reply_bob_1",
      postId: "post_1",
      postAuthor: "bob.jolt",
      author: "bob.jolt",
      parent: "post_1",
      body: "Adding context to my post",
      createdAt: "2026-06-17T09:00:00.000Z"
    });
    const second = createThreadReply({
      id: "reply_bob_2",
      postId: "post_1",
      postAuthor: "bob.jolt",
      author: "bob.jolt",
      parent: threadReplyReference(first),
      body: "And a nested correction",
      createdAt: "2026-06-17T09:01:00.000Z"
    });

    const tree = buildThreadTree({
      postId: "post_1",
      replies: [second, first]
    });

    expect(tree).toHaveLength(1);
    expect(tree[0].reply.body).toBe("Adding context to my post");
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].reply.body).toBe("And a nested correction");
  });

  it("tracks Bob, Alice, and Carol as thread participants without duplicates", () => {
    const manifest = createThreadManifest({
      postId: "post_1",
      owner: "bob.jolt",
      createdAt: "2026-06-17T09:00:00.000Z"
    });

    const withAlice = upsertThreadManifestParticipant(manifest, {
      identity: "alice.jolt",
      addedAt: "2026-06-17T09:01:00.000Z"
    });
    const withCarol = upsertThreadManifestParticipant(withAlice, {
      identity: "carol.jolt",
      addedAt: "2026-06-17T09:02:00.000Z"
    });
    const duplicateAlice = upsertThreadManifestParticipant(withCarol, {
      identity: "alice.jolt",
      addedAt: "2026-06-17T09:03:00.000Z"
    });

    expect(duplicateAlice.participants.map((participant) => participant.identity)).toEqual([
      "bob.jolt",
      "alice.jolt",
      "carol.jolt"
    ]);
  });

  it("lets Alice and Carol reply to the post or any visible reply in the same thread", () => {
    const bob = createThreadReply({
      id: "reply_bob_1",
      postId: "post_1",
      postAuthor: "bob.jolt",
      author: "bob.jolt",
      parent: "post_1",
      body: "Bob starts the conversation",
      createdAt: "2026-06-17T09:00:00.000Z"
    });
    const alice = createThreadReply({
      id: "reply_alice_1",
      postId: "post_1",
      postAuthor: "bob.jolt",
      author: "alice.jolt",
      parent: threadReplyReference(bob),
      body: "Alice replies to Bob",
      createdAt: "2026-06-17T09:01:00.000Z"
    });
    const carol = createThreadReply({
      id: "reply_carol_1",
      postId: "post_1",
      postAuthor: "bob.jolt",
      author: "carol.jolt",
      parent: threadReplyReference(alice),
      body: "Carol replies to Alice",
      createdAt: "2026-06-17T09:02:00.000Z"
    });
    const unrelated = createThreadReply({
      id: "reply_other",
      postId: "post_2",
      postAuthor: "alice.jolt",
      author: "carol.jolt",
      parent: "post_2",
      body: "Different post",
      createdAt: "2026-06-17T09:03:00.000Z"
    });

    const tree = buildThreadTree({
      postId: "post_1",
      replies: [unrelated, carol, bob, alice]
    });

    expect(tree.map((node) => node.reply.body)).toEqual(["Bob starts the conversation"]);
    expect(tree[0].children.map((node) => node.reply.body)).toEqual(["Alice replies to Bob"]);
    expect(tree[0].children[0].children.map((node) => node.reply.body)).toEqual([
      "Carol replies to Alice"
    ]);
  });

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
