import { expect, it } from "vitest";
import { createFakeJolt } from "jolt-sdk/testing";
import { ReplyRepository } from "./repository";

it("Bob replies to his own post and reply, and every reader assembles the same public tree", async () => {
  const node = createFakeJolt("bob.jolt");
  const bob = new ReplyRepository(node.client);
  const first = {
    schema: "spoke.reply.v2" as const,
    id: "first",
    postId: "post",
    postAuthor: "bob.jolt",
    parent: "post",
    sender: "bob.jolt",
    body: "One",
    createdAt: "2026-09-07T00:00:00Z"
  };
  await bob.publish(first);
  await bob.accept("bob.jolt", first);
  await bob.publish({ ...first, id: "nested", parent: "first", body: "Two" });
  await bob.accept("bob.jolt", { ...first, id: "nested", parent: "first", body: "Two" });
  const tree = await bob.load("bob.jolt", "post");
  expect(tree.roots[0].reply.body).toBe("One");
  expect(tree.roots[0].children[0].reply.body).toBe("Two");
  expect(await new ReplyRepository(node.client).load("bob.jolt", "post")).toEqual(tree);
});

it("pins accepted bytes and rejects cycles and missing parents in public thread data", async () => {
  const node = createFakeJolt("bob.jolt");
  const repository = new ReplyRepository(node.client);
  const reply = {
    schema: "spoke.reply.v2" as const,
    id: "first",
    postId: "post",
    postAuthor: node.identity,
    parent: "post",
    sender: node.identity,
    body: "Accepted text",
    createdAt: "2026-09-07T00:00:00Z"
  };
  await repository.publish(reply);
  await repository.accept(node.identity, reply);
  await node.client.publishJson("/spoke/replies/post/first", { ...reply, body: "Changed later" });
  expect((await repository.load(node.identity, "post")).replies[0].body).toBe("Accepted text");
  await repository.publish({ ...reply, id: "loop", parent: "loop" });
  await repository.accept(node.identity, { ...reply, id: "loop", parent: "loop" });
  expect((await repository.load(node.identity, "post")).unavailable).toBe(1);
});

it("reloads your submitted public replies even before the post author includes them", async () => {
  const node = createFakeJolt("alice.jolt");
  const reply = {
    schema: "spoke.reply.v2" as const,
    id: "r",
    postId: "post",
    postAuthor: "bob.jolt",
    parent: "post",
    sender: node.identity,
    body: "My reply",
    createdAt: "2026-09-07T00:00:00Z"
  };
  await new ReplyRepository(node.client).publish(reply);
  expect(
    await new ReplyRepository(node.client).submitted(node.identity, "bob.jolt", "post")
  ).toEqual([reply]);
});

it("requires an accepted reply CID to appear in its claimed sender's signed records", async () => {
  const node = createFakeJolt("bob.jolt");
  const forged = {
    schema: "spoke.reply.v2",
    id: "r",
    postId: "post",
    postAuthor: node.identity,
    parent: "post",
    sender: "alice.jolt",
    body: "Forged Alice",
    createdAt: "2026-09-07T00:00:00Z"
  };
  const content = await node.client.publishJson("/spoke/forged", forged);
  await node.client.publishAppend("/spoke/accepted/post/r", {
    schema: "spoke.accepted_reply.v2",
    postId: "post",
    replyId: "r",
    replyRef: { identity: "alice.jolt", path: "/spoke/replies/post/r" },
    contentId: content.contentId,
    acceptedAt: forged.createdAt
  });
  expect((await new ReplyRepository(node.client).load(node.identity, "post")).replies).toEqual([]);
});
