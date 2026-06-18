import { describe, expect, it } from "vitest";
import type { IngressRecord } from "../jolt";
import { createStore } from "../common/store";
import type { ThreadEnumeration } from "../thread";
import { acceptFollowRequest, readContacts, requestFollow } from "../follow";
import { conversationIdForParticipants, selectConversations, type SpokeMessage } from "../message";
import type { SpokeFollowRequest, SpokeFollowResponse } from "../follow";
import {
  acceptInboxRecord,
  createInboxHandlers,
  processInbox,
  rejectInboxRecord,
  type InboxSdk
} from "./index";

// A stateful fake node with an ingress queue plus the publish/read surface the
// feature commands need. Records are opened by ingress id.
function fakeJolt(localIdentity: string) {
  const published = new Map<string, { body: unknown; seq: number; contentId: string }>();
  const inbox = new Map<string, { record: IngressRecord; payload: unknown }>();
  const accepted: string[] = [];
  const rejected: string[] = [];
  const sent: Array<{ recipient: string; body: unknown }> = [];

  function publish(path: string, body: unknown) {
    const seq = (published.get(path)?.seq ?? -1) + 1;
    const contentId = `cid_${path}_${seq}`;
    published.set(path, { body, seq, contentId });
    return { contentId, latestSequence: seq, path, address: `${localIdentity}${path}` };
  }
  function readHit(ref: { identity: string; path: string }, decode: (v: unknown) => unknown) {
    const rec = published.get(ref.path);
    if (!rec) return null;
    const value = decode(JSON.parse(JSON.stringify(rec.body)));
    return value === null ? null : { ref, value, latestSequence: rec.seq, contentId: rec.contentId };
  }

  function enqueue(ingressId: string, sender: string, payload: unknown, schemaHint?: string) {
    inbox.set(ingressId, {
      payload,
      record: {
        ingress_id: ingressId,
        receiver_id: "rx",
        sender_identity: sender,
        recipient_identity: localIdentity,
        schema_hint: schemaHint ?? null,
        status: "pending",
        received_at: 0,
        size: 0
      }
    });
  }

  const sdk: InboxSdk = {
    async publishJson(path, body) {
      return publish(path, body);
    },
    async read(ref, decode) {
      return readHit(ref, decode) as never;
    },
    async readContent(_contentId, ref, _latestSequence, decode) {
      return readHit(ref, decode) as never;
    },
    async publishEncryptedJson(path, body) {
      return publish(path, body);
    },
    async readEncrypted(ref, decode) {
      return readHit(ref, decode) as never;
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
      sent.push({ recipient, body });
      return publish(path, body);
    },
    async listPendingIngress() {
      return [...inbox.values()].filter((e) => e.record.status === "pending").map((e) => e.record);
    },
    async openIngress(ingressId) {
      return inbox.get(ingressId)?.payload ?? null;
    },
    async acceptIngress(ingressId) {
      const entry = inbox.get(ingressId);
      if (!entry || entry.record.status !== "pending") {
        throw new Error("ingress envelope is not pending");
      }
      entry.record.status = "accepted";
      accepted.push(ingressId);
    },
    async rejectIngress(ingressId) {
      const entry = inbox.get(ingressId);
      if (entry) entry.record.status = "rejected";
      rejected.push(ingressId);
    }
  };

  return { sdk, enqueue, accepted, rejected, sent };
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

function followResponse(overrides: Partial<SpokeFollowResponse> = {}): SpokeFollowResponse {
  return {
    schema: "spoke.follow_response.v1",
    id: "follow_resp_1",
    requestId: "follow_req_1",
    sender: "bob.jolt",
    recipient: "alice.jolt",
    decision: "accepted",
    createdAt: "2026-06-18T11:00:00.000Z",
    ...overrides
  };
}

const noopThreadBridge: ThreadEnumeration = {
  async listAccepted() {
    return { entries: [], latestSequence: 0 };
  },
  async recordAccepted() {
    return 1;
  }
};

function setup() {
  const node = fakeJolt("alice.jolt");
  const store = createStore();
  const handlers = createInboxHandlers({ threadBridge: noopThreadBridge });
  const ctx = { localIdentity: "alice.jolt", store };
  return { ...node, store, handlers, ctx };
}

describe("inbox seam", () => {
  it("auto-applies a follow response to a contact we requested", async () => {
    const { sdk, enqueue, accepted, store, handlers, ctx } = setup();
    await requestFollow(sdk, "alice.jolt", { identity: "bob.jolt", displayName: "Bob" }, store);
    enqueue("ing_1", "bob.jolt", followResponse(), "spoke.follow_response.v1");

    const result = await processInbox(sdk, handlers, ctx);

    expect(result.visible).toHaveLength(0);
    expect(result.autoHandled.map((r) => r.ingress_id)).toEqual(["ing_1"]);
    expect(accepted).toEqual(["ing_1"]);
    expect(readContacts("alice.jolt", store)).toEqual([
      { identity: "bob.jolt", displayName: "Bob", relationship: "accepted" }
    ]);
  });

  it("auto-accepts a message from an accepted contact", async () => {
    const { sdk, enqueue, store, handlers, ctx } = setup();
    await acceptFollowRequest(sdk, "alice.jolt", followRequest({ sender: "bob.jolt", displayName: "Bob" }), store);
    const message: SpokeMessage = {
      schema: "spoke.message.v1",
      id: "msg_1",
      conversationId: conversationIdForParticipants(["bob.jolt", "alice.jolt"]),
      sender: "bob.jolt",
      recipients: ["alice.jolt"],
      body: "Hello Alice",
      createdAt: "2026-06-18T12:00:00.000Z"
    };
    enqueue("ing_msg", "bob.jolt", message, "spoke.message.v1");

    const result = await processInbox(sdk, handlers, ctx);

    expect(result.autoHandled.map((r) => r.ingress_id)).toEqual(["ing_msg"]);
    const conv = Object.values(selectConversations(store.getSnapshot(), "alice.jolt"))[0];
    expect(conv.messages).toEqual([{ message, direction: "received" }]);
  });

  it("leaves a follow request for manual review without accepting it", async () => {
    const { sdk, enqueue, accepted, handlers, ctx } = setup();
    enqueue("ing_req", "carol.jolt", followRequest(), "spoke.follow_request.v1");

    const result = await processInbox(sdk, handlers, ctx);

    expect(result.autoHandled).toHaveLength(0);
    expect(result.visible.map((r) => r.ingress_id)).toEqual(["ing_req"]);
    expect(accepted).toHaveLength(0);
  });

  it("never opens a record whose schema_hint is not auto-classifiable", async () => {
    const { sdk, enqueue, handlers, ctx } = setup();
    enqueue("ing_x", "carol.jolt", { schema: "spoke.future.v9" }, "spoke.future.v9");

    const result = await processInbox(sdk, handlers, ctx);

    expect(result.visible.map((r) => r.ingress_id)).toEqual(["ing_x"]);
  });

  it("manual accept of a follow request records the contact and replies", async () => {
    const { sdk, enqueue, accepted, sent, store, handlers, ctx } = setup();
    enqueue("ing_req", "carol.jolt", followRequest(), "spoke.follow_request.v1");

    await acceptInboxRecord(sdk, handlers, "ing_req", followRequest(), ctx);

    expect(accepted).toEqual(["ing_req"]);
    expect(sent.some((s) => (s.body as SpokeFollowResponse).decision === "accepted")).toBe(true);
    expect(readContacts("alice.jolt", store)).toEqual([
      { identity: "carol.jolt", displayName: "Carol", relationship: "accepted" }
    ]);
  });

  it("manual reject of a follow request rejects the envelope and declines the requester", async () => {
    const { sdk, enqueue, rejected, sent, handlers, ctx } = setup();
    enqueue("ing_req", "carol.jolt", followRequest(), "spoke.follow_request.v1");

    await rejectInboxRecord(sdk, handlers, "ing_req", followRequest(), ctx);

    expect(rejected).toEqual(["ing_req"]);
    expect(sent.some((s) => (s.body as SpokeFollowResponse).decision === "rejected")).toBe(true);
  });
});
