import { describe, expect, it } from "vitest";
import type { JoltAppendSdk, JoltSdk, Reference } from "../jolt";
import { createStore } from "../common/store";
import type { SpokeReply } from "./model";
import {
  makeAcceptedPrefix,
  makeAcceptedRefPath,
  makeReplyPath,
  type AcceptedReplyRef,
  type SpokeReplyV2
} from "./model";
import type { ThreadEnumeration } from "./enumeration";
import { createJoltThreadEnumeration } from "./enumeration";
import { acceptanceDecision } from "./policy";
import { submitReply, acceptReply, unacceptReply } from "./commands";
import { loadThread } from "./loaders";
import { selectThread } from "./queries";

function replyV2(overrides: Partial<SpokeReplyV2>): SpokeReplyV2 {
  return {
    schema: "spoke.reply.v2",
    id: "r1",
    postId: "p1",
    postAuthor: "alice.jolt",
    parent: "p1",
    sender: "bob.jolt",
    body: "Great post",
    createdAt: "2026-06-06T10:00:00.000Z",
    ...overrides
  };
}

function acceptedRef(reply: SpokeReplyV2): AcceptedReplyRef {
  return {
    schema: "spoke.accepted_reply.v1",
    postId: reply.postId,
    replyId: reply.id,
    replyRef: { identity: reply.sender, path: makeReplyPath(reply.postId, reply.id) },
    acceptedAt: reply.createdAt,
    removed: false
  };
}

function encode(value: unknown): number[] {
  return Array.from(new TextEncoder().encode(JSON.stringify(value)));
}

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

// A fixed-result enumeration for loader tests (lets us simulate stale reads).
function staticEnumeration(refs: AcceptedReplyRef[], latestSequence: number): ThreadEnumeration {
  return {
    async listAccepted() {
      return { entries: refs.map((ref) => ({ ref, latestSequence })) };
    },
    async recordAccepted() {
      return latestSequence;
    }
  };
}

// An in-memory accepted Collection for command tests.
function memoryEnumeration(): ThreadEnumeration {
  const byPost = new Map<string, AcceptedReplyRef[]>();
  let seq = 0;
  return {
    async listAccepted(_author, postId) {
      return { entries: (byPost.get(postId) ?? []).map((ref) => ({ ref, latestSequence: seq })) };
    },
    async recordAccepted(postId, ref) {
      seq += 1;
      byPost.set(postId, [ref, ...(byPost.get(postId) ?? []).filter((e) => e.replyId !== ref.replyId)]);
      return seq;
    }
  };
}

describe("thread acceptance policy", () => {
  it("auto-accepts contacts and queues strangers for manual review", () => {
    expect(
      acceptanceDecision({
        sender: "bob.jolt",
        contacts: [{ identity: "bob.jolt", displayName: "Bob", relationship: "accepted" }]
      })
    ).toBe("auto");
    expect(acceptanceDecision({ sender: "stranger.jolt", contacts: [] })).toBe("manual");
  });
});

describe("thread commands", () => {
  it("a non-owner reply is submitted but does NOT enter the accepted Projection", async () => {
    const store = createStore();
    const reply = replyV2({ id: "r_bob", sender: "bob.jolt" });

    await submitReply(fakeSdk(), reply, store);

    // A third party sees nothing until the author accepts.
    expect(
      selectThread(store.getSnapshot(), { postId: "p1", postAuthor: "alice.jolt", localIdentity: "carol.jolt" })
    ).toEqual([]);
    // The replier sees their own pending reply (outbox overlay).
    const own = selectThread(store.getSnapshot(), { postId: "p1", postAuthor: "alice.jolt", localIdentity: "bob.jolt" });
    expect(own.map((n) => n.id)).toEqual(["r_bob"]);
  });

  it("the post author accepting a reply adds its reference to the accepted Collection", async () => {
    const store = createStore();
    const enumeration = memoryEnumeration();
    const reply = replyV2({ id: "r_bob", sender: "bob.jolt" });

    await acceptReply(fakeSdk(), enumeration, reply, store);

    const accepted = await enumeration.listAccepted("alice.jolt", "p1");
    expect(accepted.entries.map((e) => e.ref.replyId)).toContain("r_bob");
    // Now visible to a third party.
    const tree = selectThread(store.getSnapshot(), { postId: "p1", postAuthor: "alice.jolt", localIdentity: "carol.jolt" });
    expect(tree.map((n) => n.id)).toEqual(["r_bob"]);
  });

  it("un-accepting tombstones the reference and removes it from the Projection", async () => {
    const store = createStore();
    const enumeration = memoryEnumeration();
    const reply = replyV2({ id: "r_bob", sender: "bob.jolt" });
    const ref = await acceptReply(fakeSdk(), enumeration, reply, store);

    await unacceptReply(fakeSdk(), enumeration, "alice.jolt", ref, store);

    expect(
      selectThread(store.getSnapshot(), { postId: "p1", postAuthor: "alice.jolt", localIdentity: "carol.jolt" })
    ).toEqual([]);
  });
});

describe("thread loaders", () => {
  it("loadThread builds the nested tree from accepted references", async () => {
    const store = createStore();
    const bob = replyV2({ id: "r_bob", sender: "bob.jolt", parent: "p1", createdAt: "2026-06-06T10:00:00.000Z" });
    const carol = replyV2({ id: "r_carol", sender: "carol.jolt", parent: "r_bob", createdAt: "2026-06-06T10:05:00.000Z" });
    const sdk = fakeSdk({
      [`bob.jolt${makeReplyPath("p1", "r_bob")}`]: { latestSequence: 1, contentId: "c1", bytes: encode(bob) },
      [`carol.jolt${makeReplyPath("p1", "r_carol")}`]: { latestSequence: 1, contentId: "c2", bytes: encode(carol) }
    });
    const enumeration = staticEnumeration([acceptedRef(bob), acceptedRef(carol)], 2);

    await loadThread(sdk, enumeration, "alice.jolt", "p1", store);

    const tree = selectThread(store.getSnapshot(), { postId: "p1", postAuthor: "alice.jolt" });
    expect(tree.map((n) => n.id)).toEqual(["r_bob"]);
    expect(tree[0].children.map((n) => n.id)).toEqual(["r_carol"]);
  });

  it("a stale enumeration cannot remove an already-accepted reference", async () => {
    const store = createStore();
    const enumeration = memoryEnumeration();
    const bob = replyV2({ id: "r_bob", sender: "bob.jolt" });
    const dana = replyV2({ id: "r_dana", sender: "dana.jolt", createdAt: "2026-06-06T11:00:00.000Z" });
    await acceptReply(fakeSdk(), enumeration, bob, store);
    await acceptReply(fakeSdk(), enumeration, dana, store);

    // A later, incomplete refresh only reports r_bob at an older sequence.
    await loadThread(fakeSdk(), staticEnumeration([acceptedRef(bob)], 1), "alice.jolt", "p1", store);

    const tree = selectThread(store.getSnapshot(), { postId: "p1", postAuthor: "alice.jolt", localIdentity: "carol.jolt" });
    expect(tree.map((n) => n.id).sort()).toEqual(["r_bob", "r_dana"]);
  });
});

describe("Bob/Alice/Carol recursive thread", () => {
  it("assembles the same nested tree from public references", async () => {
    const store = createStore();
    // Alice posts p1. Bob replies to the post; Alice replies to Bob; Carol replies to Bob.
    const bob = replyV2({ id: "r_bob", sender: "bob.jolt", parent: "p1", createdAt: "2026-06-06T10:00:00.000Z" });
    const aliceReply = replyV2({ id: "r_alice", sender: "alice.jolt", parent: "r_bob", createdAt: "2026-06-06T10:01:00.000Z" });
    const carol = replyV2({ id: "r_carol", sender: "carol.jolt", parent: "r_bob", createdAt: "2026-06-06T10:02:00.000Z" });
    const sdk = fakeSdk({
      [`bob.jolt${makeReplyPath("p1", "r_bob")}`]: { latestSequence: 1, contentId: "c1", bytes: encode(bob) },
      [`alice.jolt${makeReplyPath("p1", "r_alice")}`]: { latestSequence: 1, contentId: "c2", bytes: encode(aliceReply) },
      [`carol.jolt${makeReplyPath("p1", "r_carol")}`]: { latestSequence: 1, contentId: "c3", bytes: encode(carol) }
    });
    const enumeration = staticEnumeration(
      [acceptedRef(bob), acceptedRef(aliceReply), acceptedRef(carol)],
      3
    );

    await loadThread(sdk, enumeration, "alice.jolt", "p1", store);

    const tree = selectThread(store.getSnapshot(), { postId: "p1", postAuthor: "alice.jolt" });
    expect(tree.map((n) => n.id)).toEqual(["r_bob"]);
    // Both nested replies hang under Bob, oldest-first.
    expect(tree[0].children.map((n) => n.id)).toEqual(["r_alice", "r_carol"]);
  });
});

describe("legacy compatibility", () => {
  it("renders legacy spoke.reply.v1 replies read-only", () => {
    const store = createStore();
    const legacy: SpokeReply = {
      schema: "spoke.reply.v1",
      id: "r_legacy",
      sender: "bob.jolt",
      postAuthor: "alice.jolt",
      postAddress: "alice.jolt/spoke/posts/p1",
      body: "Old flat reply",
      createdAt: "2026-06-01T10:00:00.000Z"
    };
    store.upsert({
      identity: "bob",
      path: "/spoke/replies/r_legacy",
      latestSequence: 1,
      contentId: "c_legacy",
      value: legacy
    });

    const tree = selectThread(store.getSnapshot(), { postId: "p1", postAuthor: "alice.jolt", localIdentity: "carol.jolt" });
    expect(tree.map((n) => n.id)).toEqual(["r_legacy"]);
  });
});

describe("jolt thread enumeration", () => {
  it("recordAccepted publishes an append record and listAccepted reads the prefix back", async () => {
    const reply = replyV2({ id: "r_bob", sender: "bob.jolt" });
    const ref = acceptedRef(reply);
    const appendPath = makeAcceptedRefPath("p1", "r_bob");
    const appended: Array<{ path: string; body: unknown }> = [];
    const sdk: JoltSdk & JoltAppendSdk = {
      async publishJson(path) {
        return { contentId: "c", latestSequence: 1, path, address: null };
      },
      async read(r: Reference, decode) {
        if (r.path !== appendPath) return null;
        const value = decode(JSON.parse(new TextDecoder().decode(new Uint8Array(encode(ref)))));
        return value === null ? null : { ref: r, value, latestSequence: 7, contentId: "cacc" };
      },
      async publishAppend(path, body) {
        appended.push({ path, body });
        return { contentId: "cacc", latestSequence: 7, path, address: null };
      },
      async enumerate(identity, prefix) {
        return prefix === makeAcceptedPrefix("p1")
          ? [
              {
                identity,
                path: appendPath,
                contentId: "cacc",
                deviceId: "dev_1",
                deviceSequence: 0,
                createdAt: "2026-06-06T10:00:00.000Z",
                entryHash: "hash_1"
              }
            ]
          : [];
      }
    };
    const enumeration = createJoltThreadEnumeration(sdk);

    const seq = await enumeration.recordAccepted("p1", ref);
    expect(seq).toBe(7);
    expect(appended[0].path).toBe(appendPath);

    const listed = await enumeration.listAccepted("alice.jolt", "p1");
    expect(listed.entries.map((e) => e.ref.replyId)).toEqual(["r_bob"]);
    expect(listed.entries[0].latestSequence).toBe(7);
  });
});
