import { describe, expect, it } from "vitest";
import { Subscription } from "jolt-sdk/data";

import { SpokeData } from "../data";
import type { EnumeratedRecord, JoltAppendSdk, Reference } from "../jolt";
import { migrateLegacyPosts, type LegacyPostReader } from "./migrate-legacy-posts";
import type { SpokePost } from "./model";

function legacyPost(): SpokePost {
  return {
    schema: "spoke.post.v2",
    id: "legacy-1",
    author: "alice.jolt",
    title: "Before Data SDK",
    body: "Keep this post",
    createdAt: "2026-08-29T09:00:00.000Z",
    path: "/spoke/posts/legacy-1",
    threadPath: "/spoke/accepted/legacy-1/",
    attachments: [{
      id: "photo-1",
      kind: "image",
      contentId: "cid-photo",
      address: null,
      mimeType: "image/jpeg",
      size: 1_024,
    }],
  };
}

function legacyReader(post: SpokePost): LegacyPostReader {
  const record: EnumeratedRecord = {
    identity: post.author,
    path: post.path,
    contentId: "cid-legacy-post",
    deviceId: "dev-legacy",
    deviceSequence: 1,
    createdAt: 1_788_000_000,
    entryHash: "hash-legacy-post",
  };
  return {
    async enumerate(identity, prefix) {
      return identity === post.author && post.path.startsWith(prefix) ? [record] : [];
    },
    async readContent(_contentId, ref: Reference, latestSequence, decode) {
      const value = decode(post);
      return value === null
        ? null
        : { ref, value, latestSequence, contentId: record.contentId };
    },
  } as LegacyPostReader & Pick<JoltAppendSdk, "enumerate">;
}

describe("legacy post migration", () => {
  it("idempotently republishes only the local author's Append posts as typed records", async () => {
    const world = SpokeData.testWorld();
    const alice = world.as("alice.jolt");
    const viewer = world.as("viewer.jolt");
    const legacy = legacyPost();

    await migrateLegacyPosts(alice, "alice.jolt", legacyReader(legacy));
    await migrateLegacyPosts(alice, "alice.jolt", legacyReader(legacy));

    const subscription = await Subscription.create(viewer.posts.for("alice.jolt"));
    const posts = await subscription.get();
    expect(posts).toHaveLength(1);
    expect(posts[0]?.value).toMatchObject({
      title: "Before Data SDK",
      threadPath: "/spoke/accepted/legacy-1/",
      attachments: [{ id: "photo-1", contentId: "cid-photo" }],
    });
    expect(posts[0]?.value.attachments?.[0]).not.toHaveProperty("address");
  });
});
