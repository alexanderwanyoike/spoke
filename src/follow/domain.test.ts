import { describe, expect, it } from "vitest";
import type { JoltEncryptedSdk, JoltIngressSdk, PublishResult } from "../jolt";
import { createStore, type Store } from "../common/store";
import {
  acceptFollowRequest,
  addContact,
  applyIncomingResponse,
  removeContact,
  requestFollow
} from "./commands";
import { loadContacts } from "./loaders";
import { selectContacts } from "./queries";
import { makeContactPath, type SpokeContact, type SpokeFollowRequest } from "./model";

// A stateful fake of one identity's Jolt node: encrypted publications live in a
// map keyed by path, so publish -> listPublished -> readEncrypted round-trips
// like the real daemon. It records ingress sends and encryption recipients so
// the contact seam can be tested without transport, the daemon, or crypto.
function fakeJolt(localIdentity: string) {
  const published = new Map<string, { body: unknown; seq: number; contentId: string }>();
  const sent: Array<{ recipient: string; path: string; body: unknown }> = [];
  const encrypted: Array<{ path: string; recipients: string[] }> = [];

  function publish(path: string, body: unknown): PublishResult {
    const seq = (published.get(path)?.seq ?? -1) + 1;
    const contentId = `cid_${path}_${seq}`;
    published.set(path, { body, seq, contentId });
    return { contentId, latestSequence: seq, path, address: `${localIdentity}${path}` };
  }

  const sdk: JoltEncryptedSdk & JoltIngressSdk = {
    async publishEncryptedJson(path, body, recipients) {
      encrypted.push({ path, recipients });
      return publish(path, body);
    },
    async readEncrypted(ref, decode) {
      const rec = published.get(ref.path);
      if (!rec) return null;
      const value = decode(JSON.parse(JSON.stringify(rec.body)));
      return value === null ? null : { ref, value, latestSequence: rec.seq, contentId: rec.contentId };
    },
    async listPublished() {
      return [...published.entries()].map(([path, rec]) => ({
        content_id: rec.contentId,
        size: 0,
        path,
        address: `${localIdentity}${path}`,
        pin_state: "pinned"
      }));
    },
    async sendObject(recipient, path, body) {
      sent.push({ recipient, path, body });
      return publish(path, body);
    },
    async listPendingIngress() {
      return [];
    },
    async openIngress() {
      return null;
    },
    async acceptIngress() {},
    async rejectIngress() {}
  };

  return { sdk, sent, encrypted };
}

function followRequest(overrides: Partial<SpokeFollowRequest> = {}): SpokeFollowRequest {
  return {
    schema: "spoke.follow_request.v1",
    id: "follow_req_1",
    sender: "carol.jolt",
    recipient: "alice.jolt",
    displayName: "Carol",
    message: "Hi",
    createdAt: "2026-06-18T10:00:00.000Z",
    ...overrides
  };
}

describe("contact graph commands", () => {
  it("addContact publishes a local edge encrypted to self and projects it", async () => {
    const { sdk, encrypted } = fakeJolt("alice.jolt");
    const store = createStore();

    await addContact(sdk, "alice.jolt", { identity: "bob.jolt", displayName: "Bob" }, store);

    expect(selectContacts(store.getSnapshot(), "alice.jolt")).toEqual([
      { identity: "bob.jolt", displayName: "Bob", relationship: "local" }
    ]);
    // Encrypted to the local identity only (ADR 0004: private, no friends-of-friends).
    expect(encrypted).toEqual([{ path: makeContactPath("bob.jolt"), recipients: ["alice.jolt"] }]);
  });

  it("requestFollow sends a follow request and records a requested edge", async () => {
    const { sdk, sent } = fakeJolt("alice.jolt");
    const store = createStore();

    const { request } = await requestFollow(
      sdk,
      "alice.jolt",
      { identity: "bob.jolt", displayName: "Bobby", message: "hi", fromDisplayName: "Alice" },
      store
    );

    expect(request.schema).toBe("spoke.follow_request.v1");
    expect(sent).toHaveLength(1);
    expect(sent[0].recipient).toBe("bob.jolt");
    expect((sent[0].body as SpokeFollowRequest).message).toBe("hi");
    expect(selectContacts(store.getSnapshot(), "alice.jolt")).toEqual([
      { identity: "bob.jolt", displayName: "Bobby", relationship: "requested" }
    ]);
  });

  it("acceptFollowRequest records an accepted edge and sends an accepted response", async () => {
    const { sdk, sent } = fakeJolt("alice.jolt");
    const store = createStore();

    const { response } = await acceptFollowRequest(sdk, "alice.jolt", followRequest(), store);

    expect(response.decision).toBe("accepted");
    expect(sent[0].recipient).toBe("carol.jolt");
    expect(selectContacts(store.getSnapshot(), "alice.jolt")).toEqual([
      { identity: "carol.jolt", displayName: "Carol", relationship: "accepted" }
    ]);
  });

  it("requestFollow refuses a request to your own identity", async () => {
    const { sdk, sent } = fakeJolt("alice.jolt");
    const store = createStore();

    await expect(
      requestFollow(sdk, "alice.jolt", { identity: "alice.jolt", displayName: "Me" }, store)
    ).rejects.toThrow(/yourself/i);
    // A self edge that would later crash the message-thread projection is never created.
    expect(sent).toHaveLength(0);
    expect(selectContacts(store.getSnapshot(), "alice.jolt")).toEqual([]);
  });

  it("acceptFollowRequest refuses a request whose sender is your own identity", async () => {
    const { sdk, sent } = fakeJolt("alice.jolt");
    const store = createStore();

    await expect(
      acceptFollowRequest(sdk, "alice.jolt", followRequest({ sender: "alice.jolt" }), store)
    ).rejects.toThrow(/own identity/i);
    expect(sent).toHaveLength(0);
    expect(selectContacts(store.getSnapshot(), "alice.jolt")).toEqual([]);
  });

  it("applyIncomingResponse upgrades a requested edge to accepted, preserving the nickname", async () => {
    const { sdk } = fakeJolt("alice.jolt");
    const store = createStore();
    await requestFollow(sdk, "alice.jolt", { identity: "bob.jolt", displayName: "Bobby" }, store);

    await applyIncomingResponse(
      sdk,
      "alice.jolt",
      {
        schema: "spoke.follow_response.v1",
        id: "follow_resp_1",
        requestId: "follow_req_1",
        sender: "bob.jolt",
        recipient: "alice.jolt",
        decision: "accepted",
        createdAt: "2026-06-18T11:00:00.000Z"
      },
      store
    );

    expect(selectContacts(store.getSnapshot(), "alice.jolt")).toEqual([
      { identity: "bob.jolt", displayName: "Bobby", relationship: "accepted" }
    ]);
  });

  it("applyIncomingResponse refuses a response whose sender is your own identity", async () => {
    const { sdk } = fakeJolt("alice.jolt");
    const store = createStore();

    await expect(
      applyIncomingResponse(
        sdk,
        "alice.jolt",
        {
          schema: "spoke.follow_response.v1",
          id: "follow_resp_self",
          requestId: "follow_req_1",
          sender: "alice.jolt",
          recipient: "alice.jolt",
          decision: "accepted",
          createdAt: "2026-06-18T11:00:00.000Z"
        },
        store
      )
    ).rejects.toThrow(/own identity/i);
    // The third write path that could mint a self accepted edge stays closed.
    expect(selectContacts(store.getSnapshot(), "alice.jolt")).toEqual([]);
  });

  it("a rejected response and removeContact tombstone the edge out of the projection", async () => {
    const { sdk } = fakeJolt("alice.jolt");
    const store = createStore();
    await requestFollow(sdk, "alice.jolt", { identity: "bob.jolt", displayName: "Bobby" }, store);
    await addContact(sdk, "alice.jolt", { identity: "dave.jolt", displayName: "Dave" }, store);

    await applyIncomingResponse(
      sdk,
      "alice.jolt",
      {
        schema: "spoke.follow_response.v1",
        id: "follow_resp_1",
        requestId: "follow_req_1",
        sender: "bob.jolt",
        recipient: "alice.jolt",
        decision: "rejected",
        createdAt: "2026-06-18T11:00:00.000Z"
      },
      store
    );
    await removeContact(sdk, "alice.jolt", "dave.jolt", store);

    expect(selectContacts(store.getSnapshot(), "alice.jolt")).toEqual([]);
  });

  it("loadContacts hydrates the graph and a stale reload cannot drop an accepted edge", async () => {
    const { sdk } = fakeJolt("alice.jolt");
    const store = createStore();

    // The graph on disk only knows bob as "requested" (seq 0).
    await requestFollow(sdk, "alice.jolt", { identity: "bob.jolt", displayName: "Bobby" }, store);
    // A newer confirmed write upgraded bob to "accepted" in the store (seq 5).
    const accepted: SpokeContact = {
      schema: "spoke.contact.v1",
      identity: "bob.jolt",
      displayName: "Bobby",
      relationship: "accepted",
      updatedAt: "2026-06-18T12:00:00.000Z"
    };
    store.upsert({
      identity: "alice",
      path: makeContactPath("bob.jolt"),
      latestSequence: 5,
      contentId: "cid_accepted",
      value: accepted
    });

    await loadContacts(sdk, "alice.jolt", store);

    // The stale "requested" read (seq 0) is a no-op downgrade; bob stays accepted.
    expect(selectContacts(store.getSnapshot(), "alice.jolt")).toEqual([
      { identity: "bob.jolt", displayName: "Bobby", relationship: "accepted" }
    ]);
  });
});
