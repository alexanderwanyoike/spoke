import { describe, expect, it } from "vitest";
import {
  conversationIdForParticipants,
  conversationsFromMessages,
  isSpokeMessage,
  messageBelongsToConversation,
  otherParticipants,
  upsertConversationMessage,
  type Conversation,
  type SpokeMessage
} from "./message";

function message(overrides: Partial<SpokeMessage>): SpokeMessage {
  return {
    schema: "spoke.message.v1",
    id: "msg_1",
    conversationId: conversationIdForParticipants(["alice.jolt", "bob.jolt"]),
    sender: "alice.jolt",
    recipients: ["bob.jolt"],
    body: "Hello",
    createdAt: "2026-06-16T10:00:00.000Z",
    ...overrides
  };
}

describe("Spoke message helpers", () => {
  it("derives stable one-to-one conversation ids independent of participant order", () => {
    expect(conversationIdForParticipants(["bob.jolt", "alice.jolt"])).toBe(
      conversationIdForParticipants(["alice", "bob"])
    );
    expect(() => conversationIdForParticipants(["alice.jolt"])).toThrow(
      "A one-to-one conversation needs exactly two participants."
    );
    expect(() => conversationIdForParticipants(["alice.jolt", "bob.jolt", "carol.jolt"])).toThrow(
      "A one-to-one conversation needs exactly two participants."
    );
  });

  it("validates that a message belongs to its participant-derived conversation", () => {
    expect(messageBelongsToConversation(message({}))).toBe(true);
    expect(messageBelongsToConversation(message({ conversationId: "conv_other" }))).toBe(false);
    expect(
      messageBelongsToConversation(
        message({
          conversationId: "conv_alice_bob_carol",
          recipients: ["bob.jolt", "carol.jolt"]
        })
      )
    ).toBe(false);
  });

  it("groups sent and received messages in timestamp order", () => {
    const first = message({
      id: "msg_1",
      sender: "alice.jolt",
      recipients: ["bob.jolt"],
      body: "First",
      createdAt: "2026-06-16T10:00:00.000Z"
    });
    const second = message({
      id: "msg_2",
      sender: "bob.jolt",
      recipients: ["alice.jolt"],
      body: "Second",
      createdAt: "2026-06-16T10:01:00.000Z"
    });

    const result = conversationsFromMessages([
      { message: second, direction: "received" },
      { message: first, direction: "sent" }
    ]);

    expect(result[first.conversationId].messages.map((item) => item.message.body)).toEqual([
      "First",
      "Second"
    ]);
    expect(result[first.conversationId].lastMessageAt).toBe("2026-06-16T10:01:00.000Z");
  });

  it("replaces duplicate messages by id", () => {
    const original = message({ id: "msg_1", body: "Original" });
    const edited = message({ id: "msg_1", body: "Edited" });

    const result = upsertConversationMessage(
      upsertConversationMessage({}, original, "sent"),
      edited,
      "received"
    );

    expect(result[original.conversationId].messages).toEqual([
      { message: edited, direction: "received" }
    ]);
  });

  it("finds the non-local participants for display", () => {
    const conversation: Conversation = {
      id: "conv_1",
      participants: ["alice.jolt", "bob.jolt"],
      messages: [],
      lastMessageAt: "2026-06-16T10:00:00.000Z"
    };

    expect(otherParticipants(conversation, "alice")).toEqual(["bob.jolt"]);
  });

  it("recognizes Spoke message payloads", () => {
    expect(isSpokeMessage(message({}))).toBe(true);
    expect(isSpokeMessage({ schema: "spoke.reply.v1" })).toBe(false);
  });
});
