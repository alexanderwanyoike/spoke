import { describe, expect, it } from "vitest";
import type { JoltSdk, Reference } from "../jolt";
import { createStore } from "../common/store";
import type { SpokePost } from "../api";
import type { Contact } from "./model";
import { FEED_PATH } from "./model";
import type { EnumerationSource, PostRef } from "./enumeration";
import { createBridgeEnumeration } from "./enumeration";
import { publishPost } from "./commands";
import { loadFeed } from "./loaders";
import { selectFeed } from "./queries";

function post(overrides: Partial<SpokePost>): SpokePost {
  return {
    schema: "spoke.post.v1",
    id: "post_1",
    author: "alice.jolt",
    displayName: "Alice",
    title: "Hello",
    body: "First post",
    createdAt: "2026-06-06T10:00:00.000Z",
    path: "/spoke/posts/post_1",
    ...overrides
  };
}

function encode(value: unknown): number[] {
  return Array.from(new TextEncoder().encode(JSON.stringify(value)));
}

function contact(identity: string, overrides: Partial<Contact> = {}): Contact {
  return { identity, displayName: identity, relationship: "accepted", ...overrides };
}

// Fakeable SDK + enumeration source: the seam is interfaces, so the feed domain
// is testable without the Jolt transport, the daemon, or a real feed index.
function fakeSdk(
  reads: Record<string, { latestSequence: number; contentId: string; bytes: number[] }> = {},
  onPublish?: (path: string, body: object) => void
): JoltSdk {
  return {
    async publishJson(path, body) {
      onPublish?.(path, body);
      return { contentId: `cid_${path}`, latestSequence: 1, path, address: null };
    },
    async read(ref: Reference, decode) {
      const hit = reads[`${ref.identity}${ref.path}`];
      if (!hit) return null;
      const value = decode(JSON.parse(new TextDecoder().decode(new Uint8Array(hit.bytes))));
      return value === null ? null : { ref, value, latestSequence: hit.latestSequence, contentId: hit.contentId };
    }
  };
}

function fakeEnumeration(
  byIdentity: Record<string, PostRef[]>,
  recorded: PostRef[] = []
): EnumerationSource {
  return {
    async listPosts(identity) {
      return byIdentity[identity] || [];
    },
    async recordPost(p) {
      recorded.push({ id: p.id, path: p.path, author: p.author, createdAt: p.createdAt });
    }
  };
}

describe("feed commands", () => {
  it("publishPost publishes the post, records it for enumeration, and upserts the store", async () => {
    const store = createStore();
    const published: string[] = [];
    const recorded: PostRef[] = [];
    const sdk = fakeSdk({}, (path) => published.push(path));
    const enumeration = fakeEnumeration({}, recorded);

    await publishPost(sdk, enumeration, post({ id: "post_1" }), store);

    expect(published).toContain("/spoke/posts/post_1");
    expect(recorded.map((r) => r.path)).toEqual(["/spoke/posts/post_1"]);
    const feed = selectFeed(store.getSnapshot(), { localIdentity: "alice.jolt", contacts: [] });
    expect(feed.map((item) => item.post.id)).toEqual(["post_1"]);
    expect(feed[0].source).toBe("local");
  });
});

describe("feed loaders", () => {
  it("loadFeed enumerates, reads, and folds posts scoped to local + active contacts, newest first", async () => {
    const store = createStore();
    const local = post({ id: "p_local", author: "alice.jolt", createdAt: "2026-06-06T12:00:00.000Z" });
    const bob = post({ id: "p_bob", author: "bob.jolt", path: "/spoke/posts/p_bob", createdAt: "2026-06-06T11:00:00.000Z" });
    const sdk = fakeSdk({
      "alice.jolt/spoke/posts/p_local": { latestSequence: 1, contentId: "c1", bytes: encode(local) },
      "bob.jolt/spoke/posts/p_bob": { latestSequence: 1, contentId: "c2", bytes: encode(bob) }
    });
    const enumeration = fakeEnumeration({
      "alice.jolt": [{ id: "p_local", path: "/spoke/posts/p_local", author: "alice.jolt" }],
      "bob.jolt": [{ id: "p_bob", path: "/spoke/posts/p_bob", author: "bob.jolt" }]
    });

    await loadFeed(sdk, enumeration, ["alice.jolt", "bob.jolt"], store);

    const feed = selectFeed(store.getSnapshot(), {
      localIdentity: "alice.jolt",
      contacts: [contact("bob.jolt", { displayName: "Bob" })]
    });
    expect(feed.map((item) => item.post.id)).toEqual(["p_local", "p_bob"]);
    expect(feed.find((item) => item.post.id === "p_bob")?.contact?.displayName).toBe("Bob");
  });

  it("skips objects that do not decode as posts", async () => {
    const store = createStore();
    const sdk = fakeSdk({
      "mallory.jolt/spoke/posts/junk": { latestSequence: 1, contentId: "c", bytes: encode({ nope: true }) }
    });
    const enumeration = fakeEnumeration({
      "mallory.jolt": [{ id: "junk", path: "/spoke/posts/junk", author: "mallory.jolt" }]
    });

    await loadFeed(sdk, enumeration, ["mallory.jolt"], store);

    expect(selectFeed(store.getSnapshot(), { localIdentity: "x", contacts: [contact("mallory.jolt")] })).toEqual([]);
  });
});

describe("feed queries", () => {
  it("excludes posts from identities that are not the local user or an active contact", async () => {
    const store = createStore();
    const stranger = post({ id: "p_s", author: "stranger.jolt", path: "/spoke/posts/p_s" });
    const requested = post({ id: "p_r", author: "carol.jolt", path: "/spoke/posts/p_r" });
    const sdk = fakeSdk({
      "stranger.jolt/spoke/posts/p_s": { latestSequence: 1, contentId: "cs", bytes: encode(stranger) },
      "carol.jolt/spoke/posts/p_r": { latestSequence: 1, contentId: "cr", bytes: encode(requested) }
    });
    const enumeration = fakeEnumeration({
      "stranger.jolt": [{ id: "p_s", path: "/spoke/posts/p_s", author: "stranger.jolt" }],
      "carol.jolt": [{ id: "p_r", path: "/spoke/posts/p_r", author: "carol.jolt" }]
    });
    await loadFeed(sdk, enumeration, ["stranger.jolt", "carol.jolt"], store);

    const feed = selectFeed(store.getSnapshot(), {
      localIdentity: "alice.jolt",
      // carol is only "requested" (follow not accepted), stranger is unknown
      contacts: [contact("carol.jolt", { relationship: "requested" })]
    });
    expect(feed).toEqual([]);
  });

  it("a stale feed refetch cannot drop a post the store already knows (monotonic)", async () => {
    const store = createStore();
    const p1 = post({ id: "p1", author: "bob.jolt", path: "/spoke/posts/p1", createdAt: "2026-06-06T09:00:00.000Z" });
    const p2 = post({ id: "p2", author: "bob.jolt", path: "/spoke/posts/p2", createdAt: "2026-06-06T10:00:00.000Z" });
    const sdk = fakeSdk({
      "bob.jolt/spoke/posts/p1": { latestSequence: 1, contentId: "c1", bytes: encode(p1) },
      "bob.jolt/spoke/posts/p2": { latestSequence: 1, contentId: "c2", bytes: encode(p2) }
    });

    // First load sees both posts.
    await loadFeed(sdk, fakeEnumeration({ "bob.jolt": [
      { id: "p1", path: "/spoke/posts/p1", author: "bob.jolt" },
      { id: "p2", path: "/spoke/posts/p2", author: "bob.jolt" }
    ] }), ["bob.jolt"], store);

    // A later, incomplete enumeration only returns p1.
    await loadFeed(sdk, fakeEnumeration({ "bob.jolt": [
      { id: "p1", path: "/spoke/posts/p1", author: "bob.jolt" }
    ] }), ["bob.jolt"], store);

    const feed = selectFeed(store.getSnapshot(), {
      localIdentity: "alice.jolt",
      contacts: [contact("bob.jolt")]
    });
    expect(feed.map((item) => item.post.id)).toEqual(["p2", "p1"]);
  });
});

describe("bridge enumeration", () => {
  it("listPosts reads the feed index singleton and maps it to post refs", async () => {
    const index = {
      schema: "spoke.feed.v1" as const,
      owner: "bob.jolt",
      updatedAt: "2026-06-06T10:00:00.000Z",
      posts: [
        { id: "p1", path: "/spoke/posts/p1", title: "One", createdAt: "2026-06-06T09:00:00.000Z" }
      ]
    };
    const sdk = fakeSdk({
      "bob.jolt/spoke/feed": { latestSequence: 3, contentId: "cidx", bytes: encode(index) }
    });
    const bridge = createBridgeEnumeration(sdk, {
      localIdentity: "alice.jolt",
      listLocalPosts: async () => []
    });

    const refs = await bridge.listPosts("bob.jolt");
    expect(refs.map((r) => r.path)).toEqual(["/spoke/posts/p1"]);
  });

  it("recordPost rewrites the local feed index to include the new post", async () => {
    const publishes: Array<{ path: string; body: any }> = [];
    const sdk = fakeSdk({}, (path, body) => publishes.push({ path, body }));
    const bridge = createBridgeEnumeration(sdk, {
      localIdentity: "alice.jolt",
      listLocalPosts: async () => []
    });

    await bridge.recordPost(post({ id: "p_new", path: "/spoke/posts/p_new" }), {
      contentId: "cnew",
      latestSequence: 1,
      path: "/spoke/posts/p_new",
      address: "alice.jolt/spoke/posts/p_new"
    });

    const feedWrite = publishes.find((p) => p.path === FEED_PATH);
    expect(feedWrite).toBeDefined();
    expect(feedWrite!.body.posts.map((p: any) => p.id)).toContain("p_new");
  });
});
