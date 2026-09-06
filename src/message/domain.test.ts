import { describe, expect, it, vi } from "vitest";
import type { PublishResult } from "../jolt";
import { createStore } from "../common/store";
import {
  sendMessage,
  acceptReceivedMessage,
  type MessageSender,
  type MessageWriter
} from "./commands";
import { loadConversations, type ConversationLoaderSdk } from "./loaders";
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

  const reads: string[] = [];
  const sdk: MessageSender & MessageWriter & ConversationLoaderSdk & Pick<import("../jolt").JoltSdk, "read"> = {
    async publishEncryptedJson(path, body) {
      return publish(path, body);
    },
    async read(ref, decode) {
      reads.push(ref.path);
      return readHit(ref, decode) as never;
    },
    async readEncrypted(ref, decode) {
      reads.push(ref.path);
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
    }
  };

  return { sdk, sent, reads };
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

  it("loadConversations reads only what the store does not already hold", async () => {
    const { sdk, reads } = fakeJolt("alice.jolt");
    const store = createStore();
    await sendMessage(sdk, message({ id: "m1", body: "First" }), store);
    await acceptReceivedMessage(
      sdk,
      "alice.jolt",
      message({ id: "m2", sender: "bob.jolt", recipients: ["alice.jolt"], body: "Second" }),
      store
    );
    reads.length = 0;

    // The store already holds both copies from the local commands, so an
    // unchanged inventory must not re-read (and re-decrypt) either of them.
    await loadConversations(sdk, "alice.jolt", store);
    expect(reads).toEqual([]);

    // A copy that arrived outside this store (another device, a restart) is
    // read exactly once, and only that one.
    const fresh = createStore();
    await sendMessage(sdk, message({ id: "m3", body: "Third" }), fresh);
    await loadConversations(sdk, "alice.jolt", store);
    expect(reads).toHaveLength(1);
    expect(reads[0]).toContain("m3");
    expect(Object.values(selectConversations(store.getSnapshot(), "alice.jolt"))[0].messages).toHaveLength(3);
  });
});

it("persists incoming message bodies encrypted to the receiving identity", async () => {
  const incoming = message({ sender: "bob.jolt", recipients: ["alice.jolt"] });
  const publishJson = vi.fn().mockResolvedValue({ latestSequence: 1 });
  const publishEncryptedJson = vi.fn().mockResolvedValue({ latestSequence: 1 });
  const writer = { publishJson, publishEncryptedJson };
  await acceptReceivedMessage(writer, "alice.jolt", incoming, createStore());
  expect(publishEncryptedJson).toHaveBeenCalledWith("/spoke/messages/received/msg_1", incoming, ["alice.jolt"]);
  expect(publishJson).not.toHaveBeenCalled();
});

it("decrypts received copies without falling back to public reads", async () => {
  const incoming = message({ sender: "bob.jolt", recipients: ["alice.jolt"] });
  const node = fakeJolt("alice.jolt");
  await acceptReceivedMessage(node.sdk, "alice.jolt", incoming, createStore());
  const read = vi.spyOn(node.sdk, "read");
  const encrypted = vi.spyOn(node.sdk, "readEncrypted");
  await loadConversations(node.sdk, "alice.jolt", createStore());
  expect(encrypted).toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
});

it("reports an unavailable inventory instead of claiming an empty conversation list", async () => {
  const node = fakeJolt("alice.jolt");
  node.sdk.listPublished = vi.fn().mockRejectedValue(new Error("Node unavailable"));
  await expect(loadConversations(node.sdk, "alice.jolt", createStore())).rejects.toThrow("Node unavailable");
});

it("reports saved copies that cannot be decrypted without hiding readable messages", async () => {
  const node = fakeJolt("alice.jolt");
  await sendMessage(node.sdk, message(), createStore());
  node.sdk.readEncrypted = vi.fn().mockResolvedValue(null);
  const result = await loadConversations(node.sdk, "alice.jolt", createStore());
  expect(result).toEqual({ unavailableCount: 1 });
});
