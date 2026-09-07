import { expect, it, vi } from "vitest";
import { createFakeJolt } from "jolt-sdk/testing";
import { ReplyRepository } from "./repository";
import { ReplyService } from "./service";

it("publishes an owner's nested replies without an ingress request", async () => {
  const node = createFakeJolt("bob.jolt");
  const repository = new ReplyRepository(node.client);
  const service = new ReplyService("bob.jolt", node.client, repository, async () => true);
  const draft = {
    id: "one",
    postId: "post",
    postAuthor: "bob.jolt",
    parent: "post",
    body: "Hello",
    createdAt: "2026-09-07T00:00:00Z"
  };
  await service.submit(draft);
  await service.submit({ ...draft, id: "two", parent: "one", body: "And another thought" });
  expect((await repository.load("bob.jolt", "post")).roots[0].children).toHaveLength(1);
  expect(node.sent).toHaveLength(0);
  await expect(service.submit({ ...draft, id: "three", parent: "missing" })).rejects.toThrow(
    "parent"
  );
});

it("queues a stranger, re-verifies their signed reply and only acknowledges after acceptance persists", async () => {
  const alice = createFakeJolt("alice.jolt");
  const bob = createFakeJolt("bob.jolt");
  const enumerate = alice.client.enumerate;
  const readContent = alice.client.readContent;
  alice.client.enumerate = (owner, prefix) =>
    owner === bob.identity ? bob.client.enumerate(owner, prefix) : enumerate(owner, prefix);
  alice.client.readContent = (cid, ref, seq, decode) =>
    ref.identity === bob.identity
      ? bob.client.readContent(cid, ref, seq, decode)
      : readContent(cid, ref, seq, decode);
  const reply = {
    schema: "spoke.reply.v2" as const,
    id: "r1",
    postId: "post",
    postAuthor: alice.identity,
    parent: "post",
    sender: bob.identity,
    body: "Hello Alice",
    createdAt: "2026-09-07T00:00:00Z"
  };
  await new ReplyRepository(bob.client).publish(reply);
  const record = alice.deliverIngress({
    sender: bob.identity,
    body: {
      schema: "spoke.reply_request.v1",
      sender: bob.identity,
      recipient: alice.identity,
      postId: "post",
      replyId: "r1"
    }
  });
  const service = new ReplyService(
    alice.identity,
    alice.client,
    new ReplyRepository(alice.client),
    async () => true
  );
  await service.inbox.review([]);
  expect(service.inbox.getSnapshot().requests).toMatchObject([
    { ingressId: record.ingress_id, reply: { body: "Hello Alice" } }
  ]);
  const publish = vi
    .spyOn(alice.client, "publishAppend")
    .mockRejectedValueOnce(new Error("Offline"));
  await expect(service.inbox.decide(record.ingress_id, "accepted")).rejects.toThrow("Offline");
  expect(await alice.client.listPendingIngress()).toHaveLength(1);
  publish.mockRestore();
  await service.inbox.decide(record.ingress_id, "accepted");
  expect(await alice.client.listPendingIngress()).toHaveLength(0);
  expect(await alice.client.enumerate(alice.identity, "/spoke/accepted/post/")).toHaveLength(1);
});

it("leaves impersonated reply requests untouched and refuses replies to unavailable posts", async () => {
  const node = createFakeJolt("alice.jolt");
  const repository = new ReplyRepository(node.client);
  const service = new ReplyService(node.identity, node.client, repository, async () => false);
  node.deliverIngress({
    sender: "mallory.jolt",
    body: {
      schema: "spoke.reply_request.v1",
      sender: "bob.jolt",
      recipient: node.identity,
      postId: "post",
      replyId: "reply"
    }
  });
  await service.inbox.review([]);
  expect(service.inbox.getSnapshot().requests).toEqual([]);
  expect(await node.client.listPendingIngress()).toHaveLength(1);
  await expect(
    service.submit({
      id: "r",
      postId: "post",
      postAuthor: node.identity,
      parent: "post",
      body: "Hello",
      createdAt: "2026-09-07T00:00:00Z"
    })
  ).rejects.toThrow("no longer available");
  expect(await node.client.listPublished()).toHaveLength(0);
});
