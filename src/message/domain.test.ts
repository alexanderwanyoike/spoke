import { describe, expect, it } from "vitest";
import type { JoltEncryptedSdk, JoltIngressSdk, JoltSdk, PublishResult } from "../jolt";
import { createStore } from "../common/store";
import { sendMessage, acceptReceivedMessage } from "./commands";
import { loadConversations } from "./loaders";
import { selectConversations } from "./queries";
import { conversationIdForParticipants, type SpokeMessage } from "./model";

// A stateful fake node: publications live in a map keyed by path so
// publish -> listPublished -> read/readEncrypted round-trips. It does not model
// crypto (readEncrypted and read both return the stored body); the seam under
// test dispatches by path, which is what matters.
function fakeJolt(localIdentity: string) {
  const published = new Map<string, { body: unknown; seq: number; contentId: string }>();
  const sent: Array<{ recipient: string; path: string }> = [];

  function publish(path: string, body: unknown): PublishResult {
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

  const sdk: JoltSdk & JoltEncryptedSdk & JoltIngressSdk = {
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
      sent.push({ recipient, path });
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

  return { sdk, sent };
}

function message(overrides: Partial<SpokeMessage> = {}): SpokeMessage {
  const sender = overrides.sender ?? "alice.jolt";
  const recipients = overrides.recipients ?? ["bob.jolt"];
  return {
    schema: "spoke.message.v1",
    id: "msg_1",
    conversationId: conversationIdForParticipants([sender, ...recipients]),
    sender,
    recipients,
    body: "Hello",
    createdAt: "2026-06-18T10:00:00.000Z",
    ...overrides
  };
}

describe("message commands", () => {
  it("sendMessage ingress-sends to the recipient and folds a sent message", async () => {
    const { sdk, sent } = fakeJolt("alice.jolt");
    const store = createStore();

    await sendMessage(sdk, message({ body: "Hi Bob" }), store);

    expect(sent).toEqual([{ recipient: "bob.jolt", path: "/spoke/messages/outgoing/msg_1" }]);
    const convs = selectConversations(store.getSnapshot(), "alice.jolt");
    const conv = Object.values(convs)[0];
    expect(conv.messages).toEqual([{ message: message({ body: "Hi Bob" }), direction: "sent" }]);
  });

  it("sendMessage rejects a message whose participants do not match its conversation", async () => {
    const { sdk } = fakeJolt("alice.jolt");
    const store = createStore();

    await expect(
      sendMessage(sdk, message({ conversationId: "conv_wrong" }), store)
    ).rejects.toThrow("Message participants do not match its conversation.");
  });

  it("acceptReceivedMessage persists a received copy and folds a received message", async () => {
    const { sdk } = fakeJolt("alice.jolt");
    const store = createStore();
    const incoming = message({ id: "msg_2", sender: "bob.jolt", recipients: ["alice.jolt"], body: "Hey" });

    await acceptReceivedMessage(sdk, "alice.jolt", incoming, store);

    const conv = Object.values(selectConversations(store.getSnapshot(), "alice.jolt"))[0];
    expect(conv.messages).toEqual([{ message: incoming, direction: "received" }]);
  });

  it("projects both halves of a conversation in timestamp order", async () => {
    const { sdk } = fakeJolt("alice.jolt");
    const store = createStore();
    const sentMsg = message({ id: "m1", body: "First", createdAt: "2026-06-18T10:00:00.000Z" });
    const recvMsg = message({
      id: "m2",
      sender: "bob.jolt",
      recipients: ["alice.jolt"],
      body: "Second",
      createdAt: "2026-06-18T10:01:00.000Z"
    });

    await sendMessage(sdk, sentMsg, store);
    await acceptReceivedMessage(sdk, "alice.jolt", recvMsg, store);

    const conv = Object.values(selectConversations(store.getSnapshot(), "alice.jolt"))[0];
    expect(conv.messages.map((m) => [m.message.body, m.direction])).toEqual([
      ["First", "sent"],
      ["Second", "received"]
    ]);
    expect(conv.lastMessageAt).toBe("2026-06-18T10:01:00.000Z");
  });

  it("loadConversations hydrates outgoing + received copies, and a stale reload keeps known messages", async () => {
    const { sdk } = fakeJolt("alice.jolt");
    const store = createStore();
    await sendMessage(sdk, message({ id: "m1", body: "First" }), store);
    await acceptReceivedMessage(
      sdk,
      "alice.jolt",
      message({ id: "m2", sender: "bob.jolt", recipients: ["alice.jolt"], body: "Second" }),
      store
    );

    // A fresh store rebuilt purely from the node's published inventory.
    const rebuilt = createStore();
    await loadConversations(sdk, "alice.jolt", rebuilt);

    const conv = Object.values(selectConversations(rebuilt.getSnapshot(), "alice.jolt"))[0];
    expect(conv.messages.map((m) => m.message.body)).toEqual(["First", "Second"]);

    // Reloading again is idempotent and never drops a known message (monotonic).
    await loadConversations(sdk, "alice.jolt", rebuilt);
    const reloaded = Object.values(selectConversations(rebuilt.getSnapshot(), "alice.jolt"))[0];
    expect(reloaded.messages).toHaveLength(2);
  });
});
