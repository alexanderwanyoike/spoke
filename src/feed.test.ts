import { describe, expect, it } from "vitest";
import type { SpokePost } from "./api";
import {
  addOptimisticLocalPost,
  activeContacts,
  displayNameForFeedItem,
  latestPublishedByPath,
  localPostReferences,
  mergeLocalFeedSnapshot,
  mergeFeedSnapshot,
  removeContactFeedItems,
  withLocalContentIds,
  type Contact,
  type FeedItem
} from "./feed";

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

  it("removes visible feed entries for a deleted contact immediately", () => {
    const items: FeedItem[] = [
      {
        source: "contact",
        contact: contact({ identity: "alice.jolt" }),
        post: post({ author: "alice.jolt" }),
        address: "alice.jolt/spoke/posts/post_1"
      },
      {
        source: "contact",
        contact: contact({ identity: "carol.jolt" }),
        post: post({ author: "carol.jolt" }),
        address: "carol.jolt/spoke/posts/post_2"
      }
    ];

    expect(removeContactFeedItems(items, "alice.jolt")).toEqual([items[1]]);
  });

  it("does not load feeds for contacts waiting on follow acceptance", () => {
    expect(
      activeContacts([
        contact({ identity: "alice.jolt", displayName: "Alice", relationship: "accepted" }),
        contact({ identity: "bob.jolt", displayName: "Bob", relationship: "requested" })
      ]).map((item) => item.identity)
    ).toEqual(["alice.jolt"]);
  });

  it("adds a newly published local post without waiting for a network refresh", () => {
    const older = post({
      id: "post_1",
      title: "Older",
      createdAt: "2026-06-06T09:00:00.000Z",
      path: "/spoke/posts/post_1"
    });
    const newer = post({
      id: "post_2",
      title: "Newer",
      createdAt: "2026-06-06T10:00:00.000Z",
      path: "/spoke/posts/post_2"
    });

    const result = addOptimisticLocalPost(
      [{ source: "local", post: older, address: "alice.jolt/spoke/posts/post_1" }],
      newer,
      "alice.jolt/spoke/posts/post_2"
    );

    expect(result.map((item) => item.post.title)).toEqual(["Newer", "Older"]);
  });

  it("selects the newest locally published object for a path", () => {
    const result = latestPublishedByPath(
      [
        {
          content_id: "cid_old",
          size: 1,
          path: "/spoke/feed",
          address: "alice.jolt/spoke/feed",
          local_sequence: 1,
          pin_state: "local"
        },
        {
          content_id: "cid_new",
          size: 1,
          path: "/spoke/feed",
          address: "alice.jolt/spoke/feed",
          local_sequence: 3,
          pin_state: "local"
        }
      ],
      "/spoke/feed"
    );

    expect(result?.content_id).toBe("cid_new");
  });

  it("keeps optimistic local posts when an older refresh snapshot arrives", () => {
    const optimistic: FeedItem = {
      source: "local",
      post: post({
        id: "post_new",
        title: "New local post",
        createdAt: "2026-06-06T10:01:00.000Z",
        path: "/spoke/posts/post_new"
      }),
      address: "alice.jolt/spoke/posts/post_new"
    };
    const staleSnapshot: FeedItem = {
      source: "local",
      post: post({
        id: "post_old",
        title: "Old local post",
        createdAt: "2026-06-06T10:00:00.000Z",
        path: "/spoke/posts/post_old"
      }),
      address: "alice.jolt/spoke/posts/post_old"
    };

    const result = mergeFeedSnapshot([optimistic], [staleSnapshot]);

    expect(result.map((item) => item.post.title)).toEqual([
      "New local post",
      "Old local post"
    ]);
  });

  it("includes local post objects even when the feed index missed them", () => {
    const result = localPostReferences(
      {
        schema: "spoke.feed.v1",
        owner: "alice.jolt",
        updatedAt: "2026-06-06T10:00:00.000Z",
        posts: [
          {
            id: "post_indexed",
            path: "/spoke/posts/post_indexed",
            address: "alice.jolt/spoke/posts/post_indexed",
            title: "Indexed",
            createdAt: "2026-06-06T10:00:00.000Z"
          }
        ]
      },
      [
        {
          content_id: "cid_orphan",
          size: 1,
          path: "/spoke/posts/post_orphan",
          address: "alice.jolt/spoke/posts/post_orphan",
          local_sequence: 5,
          pin_state: "local"
        }
      ]
    );

    expect(result.map((item) => item.path).sort()).toEqual([
      "/spoke/posts/post_indexed",
      "/spoke/posts/post_orphan"
    ]);
    expect(result.find((item) => item.path === "/spoke/posts/post_orphan")?.contentId).toBe(
      "cid_orphan"
    );
  });

  it("keeps post content IDs from the feed index so readers can fetch immutable CIDs directly", () => {
    const result = localPostReferences(
      {
        schema: "spoke.feed.v1",
        owner: "alice.jolt",
        updatedAt: "2026-06-06T10:00:00.000Z",
        posts: [
          {
            id: "post_indexed",
            path: "/spoke/posts/post_indexed",
            contentId: "cid_indexed_post",
            address: "alice.jolt/spoke/posts/post_indexed",
            title: "Indexed",
            createdAt: "2026-06-06T10:00:00.000Z"
          }
        ]
      },
      []
    );

    expect(result).toEqual([
      {
        path: "/spoke/posts/post_indexed",
        address: "alice.jolt/spoke/posts/post_indexed",
        contentId: "cid_indexed_post"
      }
    ]);
  });

  it("enriches older address-only feed entries from the local published inventory", () => {
    const result = withLocalContentIds(
      {
        schema: "spoke.feed.v1",
        owner: "alice.jolt",
        updatedAt: "2026-06-06T10:00:00.000Z",
        posts: [
          {
            id: "post_indexed",
            path: "/spoke/posts/post_indexed",
            address: "alice.jolt/spoke/posts/post_indexed",
            title: "Indexed",
            createdAt: "2026-06-06T10:00:00.000Z"
          }
        ]
      },
      [
        {
          content_id: "cid_indexed_post",
          size: 1,
          path: "/spoke/posts/post_indexed",
          address: "alice.jolt/spoke/posts/post_indexed",
          local_sequence: 5,
          pin_state: "local"
        }
      ]
    );

    expect(result.posts[0].contentId).toBe("cid_indexed_post");
  });

  it("updates local posts without discarding current contact posts", () => {
    const contactItem: FeedItem = {
      source: "contact",
      contact: contact({ identity: "bob.jolt", displayName: "Bob" }),
      post: post({
        author: "bob.jolt",
        title: "Remote",
        createdAt: "2026-06-06T09:00:00.000Z"
      }),
      address: "bob.jolt/spoke/posts/post_remote"
    };
    const localItem: FeedItem = {
      source: "local",
      post: post({
        title: "Local",
        createdAt: "2026-06-06T10:00:00.000Z"
      }),
      address: "alice.jolt/spoke/posts/post_local"
    };

    const result = mergeLocalFeedSnapshot([contactItem], [localItem]);

    expect(result.map((item) => item.post.title)).toEqual(["Local", "Remote"]);
  });
});
