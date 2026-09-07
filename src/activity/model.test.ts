import { expect, it } from "vitest";
import { activityItems } from "./model";
import { conversation } from "../test/messages";
it("combines real received messages, public replies and contact responses without inventing events", () => {
  const thread = conversation("bob", "Bob");
  thread.messages = [
    {
      direction: "received",
      message: {
        schema: "spoke.message.v2",
        id: "msg",
        conversationId: thread.id,
        sender: "bob",
        recipients: ["alice"],
        body: "Hello",
        createdAt: "2026-09-07T02:00:00Z"
      }
    }
  ];
  const replies = [
    {
      schema: "spoke.reply.v2" as const,
      id: "reply",
      postId: "post",
      postAuthor: "alice",
      parent: "post",
      sender: "bob",
      body: "A public reply",
      createdAt: "2026-09-07T01:00:00Z"
    }
  ];
  const items = activityItems(
    "alice",
    [thread],
    [{ identity: "bob", displayName: "Bob" }],
    replies,
    { contacts: [], read: new Set(["message/msg"]) }
  );
  expect(items.map((item) => [item.kind, item.name, item.unread])).toEqual([
    ["message", "Bob", false],
    ["reply", "Bob", true]
  ]);
  expect(activityItems("alice", [], [], [], { contacts: [], read: new Set() })).toEqual([]);
});
