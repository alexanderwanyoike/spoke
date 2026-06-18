import { describe, expect, it } from "vitest";
import type { SpokePost } from "./model";
import {
  activeContacts,
  displayNameForFeedItem,
  type Contact,
  type FeedItem
} from "./model";

function post(overrides: Partial<SpokePost>): SpokePost {
  return {
    schema: "spoke.post.v1",
    id: "post_1",
    author: "alice.jolt",
    displayName: "Old Alice",
    title: "Hello",
    body: "First post",
    createdAt: "2026-06-06T10:00:00.000Z",
    path: "/spoke/posts/post_1",
    ...overrides
  };
}

function contact(overrides: Partial<Contact>): Contact {
  return {
    identity: "alice.jolt",
    displayName: "Alice",
    ...overrides
  };
}

describe("Spoke feed helpers", () => {
  it("uses the current contact alias ahead of the stale display name baked into a post", () => {
    const item: FeedItem = {
      source: "contact",
      contact: contact({ displayName: "Alice Updated" }),
      post: post({ displayName: "Alice Old" }),
      address: "alice.jolt/spoke/posts/post_1"
    };

    expect(displayNameForFeedItem(item)).toBe("Alice Updated");
  });

  it("does not load feeds for contacts waiting on follow acceptance", () => {
    expect(
      activeContacts([
        contact({ identity: "alice.jolt", displayName: "Alice", relationship: "accepted" }),
        contact({ identity: "bob.jolt", displayName: "Bob", relationship: "requested" })
      ]).map((item) => item.identity)
    ).toEqual(["alice.jolt"]);
  });
});
