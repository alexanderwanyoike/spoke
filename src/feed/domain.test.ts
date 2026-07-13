import { describe, expect, it } from "vitest";
import type { EnumeratedRecord, JoltAppendSdk, JoltSdk, Reference } from "../jolt";
import { createStore } from "../common/store";
import type { Contact, SpokePost } from "./model";
import { createJoltEnumeration } from "./enumeration";
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

// Fakeable SDK: the seam is interfaces, so the feed domain is testable without
// the Jolt transport or the daemon. `enumerations` maps an identity to the paths
// its append-record enumeration returns; `reads` holds the post bytes.
function fakeSdk(opts: {
  reads?: Record<string, { latestSequence: number; contentId: string; bytes: number[] }>;
  contentReads?: Record<string, { latestSequence: number; bytes: number[] }>;
  enumerations?: Record<string, string[]>;
  onPublishAppend?: (path: string, body: object) => void;
}): JoltSdk & JoltAppendSdk {
  const reads = opts.reads || {};
  const contentReads = opts.contentReads || {};
  const enumerations = opts.enumerations || {};
  return {
    async publishJson(path) {
      return { contentId: `cid_${path}`, latestSequence: 1, path, address: null };
    },
    async read(ref: Reference, decode) {
      const hit = reads[`${ref.identity}${ref.path}`];
      if (!hit) return null;
      const value = decode(JSON.parse(new TextDecoder().decode(new Uint8Array(hit.bytes))));
      return value === null
        ? null
        : { ref, value, latestSequence: hit.latestSequence, contentId: hit.contentId };
    },
    async readContent(contentId, ref, latestSequence, decode) {
      const hit = contentReads[contentId] || Object.values(reads).find((item) => item.contentId === contentId);
      if (!hit) return null;
      const value = decode(JSON.parse(new TextDecoder().decode(new Uint8Array(hit.bytes))));
      return value === null
        ? null
        : { ref, value, latestSequence, contentId };
    },
    async publishAppend(path, body) {
      opts.onPublishAppend?.(path, body);
      return { contentId: `cid_${path}`, latestSequence: 1, path, address: null };
    },
    async enumerate(identity, pathPrefix) {
      return (enumerations[identity] || [])
        .filter((path) => path.startsWith(pathPrefix))
        .map(
          (path, index): EnumeratedRecord => ({
            identity,
            path,
            contentId: reads[`${identity}${path}`]?.contentId || `cid_${path}`,
            deviceId: "dev_1",
            deviceSequence: reads[`${identity}${path}`]?.latestSequence ?? contentReads[`cid_${path}`]?.latestSequence ?? index,
            createdAt: "2026-06-06T00:00:00.000Z",
            entryHash: `hash_${path}`
          })
        );
    }
  };
}

describe("feed commands", () => {
  it("publishPost writes the post as an append record and upserts the store", async () => {
    const store = createStore();
    const appended: string[] = [];
    const sdk = fakeSdk({ onPublishAppend: (path) => appended.push(path) });

    await publishPost(sdk, post({ id: "post_1" }), store);

    expect(appended).toEqual(["/spoke/posts/post_1"]);
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
      reads: {
        "alice.jolt/spoke/posts/p_local": { latestSequence: 1, contentId: "c1", bytes: encode(local) },
        "bob.jolt/spoke/posts/p_bob": { latestSequence: 1, contentId: "c2", bytes: encode(bob) }
      },
      enumerations: {
        "alice.jolt": ["/spoke/posts/p_local"],
        "bob.jolt": ["/spoke/posts/p_bob"]
      }
    });

    await loadFeed(sdk, createJoltEnumeration(sdk), ["alice.jolt", "bob.jolt"], store);

    const feed = selectFeed(store.getSnapshot(), {
      localIdentity: "alice.jolt",
      contacts: [contact("bob.jolt", { displayName: "Bob" })]
    });
    expect(feed.map((item) => item.post.id)).toEqual(["p_local", "p_bob"]);
    expect(feed.find((item) => item.post.id === "p_bob")?.contact?.displayName).toBe("Bob");
  });

  it("loads append-enumerated posts by content id instead of resolving singleton path state", async () => {
    const store = createStore();
    const bob = post({
      id: "p_bob",
      author: "bob.jolt",
      path: "/spoke/posts/p_bob",
      createdAt: "2026-06-06T11:00:00.000Z"
    });
    const sdk = fakeSdk({
      // No path-addressable read exists for this append record. This mirrors
      // Jolt J1: enumeration gives the durable CID, while resolve(identity+path)
      // is singleton state and returns no content path for append records.
      reads: {},
      contentReads: {
        "cid_/spoke/posts/p_bob": { latestSequence: 4, bytes: encode(bob) }
      },
      enumerations: {
        "bob.jolt": ["/spoke/posts/p_bob"]
      }
    });

    await loadFeed(sdk, createJoltEnumeration(sdk), ["bob.jolt"], store);

    const feed = selectFeed(store.getSnapshot(), {
      localIdentity: "alice.jolt",
      contacts: [contact("bob.jolt", { displayName: "Bob" })]
    });
    expect(feed.map((item) => item.post.id)).toEqual(["p_bob"]);
    expect(store.get({ identity: "bob", path: "/spoke/posts/p_bob" })?.latestSequence).toBe(4);
  });

  it("skips objects that do not decode as posts", async () => {
    const store = createStore();
    const sdk = fakeSdk({
      reads: {
        "mallory.jolt/spoke/posts/junk": { latestSequence: 1, contentId: "c", bytes: encode({ nope: true }) }
      },
      enumerations: { "mallory.jolt": ["/spoke/posts/junk"] }
    });

    await loadFeed(sdk, createJoltEnumeration(sdk), ["mallory.jolt"], store);

    expect(selectFeed(store.getSnapshot(), { localIdentity: "x", contacts: [contact("mallory.jolt")] })).toEqual([]);
  });
});

describe("feed queries", () => {
  it("excludes posts from identities that are not the local user or an active contact", async () => {
    const store = createStore();
    const stranger = post({ id: "p_s", author: "stranger.jolt", path: "/spoke/posts/p_s" });
    const requested = post({ id: "p_r", author: "carol.jolt", path: "/spoke/posts/p_r" });
    const sdk = fakeSdk({
      reads: {
        "stranger.jolt/spoke/posts/p_s": { latestSequence: 1, contentId: "cs", bytes: encode(stranger) },
        "carol.jolt/spoke/posts/p_r": { latestSequence: 1, contentId: "cr", bytes: encode(requested) }
      },
      enumerations: {
        "stranger.jolt": ["/spoke/posts/p_s"],
        "carol.jolt": ["/spoke/posts/p_r"]
      }
    });
    await loadFeed(sdk, createJoltEnumeration(sdk), ["stranger.jolt", "carol.jolt"], store);

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
    const enumerations: Record<string, string[]> = {
      "bob.jolt": ["/spoke/posts/p1", "/spoke/posts/p2"]
    };
    const sdk = fakeSdk({
      reads: {
        "bob.jolt/spoke/posts/p1": { latestSequence: 1, contentId: "c1", bytes: encode(p1) },
        "bob.jolt/spoke/posts/p2": { latestSequence: 1, contentId: "c2", bytes: encode(p2) }
      },
      enumerations
    });
    const enumeration = createJoltEnumeration(sdk);

    // First load sees both posts.
    await loadFeed(sdk, enumeration, ["bob.jolt"], store);
    // A later, incomplete enumeration only returns p1.
    enumerations["bob.jolt"] = ["/spoke/posts/p1"];
    await loadFeed(sdk, enumeration, ["bob.jolt"], store);

    const feed = selectFeed(store.getSnapshot(), {
      localIdentity: "alice.jolt",
      contacts: [contact("bob.jolt")]
    });
    expect(feed.map((item) => item.post.id)).toEqual(["p2", "p1"]);
  });
});

describe("jolt enumeration", () => {
  it("listPosts maps an identity's append records under the posts prefix to refs", async () => {
    const sdk = fakeSdk({ enumerations: { "bob.jolt": ["/spoke/posts/p1", "/spoke/contacts/x"] } });

    const refs = await createJoltEnumeration(sdk).listPosts("bob.jolt");

    // Only records under /spoke/posts/ are posts; the contact edge is excluded.
    expect(refs.map((r) => r.path)).toEqual(["/spoke/posts/p1"]);
    expect(refs[0]).toMatchObject({ id: "p1", author: "bob.jolt", contentId: "cid_/spoke/posts/p1" });
  });
});
