import { expect, it } from "vitest";
import { createFakeJolt } from "jolt-sdk/testing";
import { ReplyRepository } from "./repository";
import { ReplyService } from "./service";

it("Bob, Alice and Carol can reply to the post and every visible reply and read the same tree", async () => {
  const nodes = ["bob.jolt", "alice.jolt", "carol.jolt"].map((identity) =>
    createFakeJolt(identity)
  );
  const sources = new Map(
    nodes.map((node) => [
      node.identity,
      {
        read: node.client.read,
        readContent: node.client.readContent,
        enumerate: node.client.enumerate
      }
    ])
  );
  for (const node of nodes) {
    node.client.read = (ref, decode) => sources.get(ref.identity)!.read(ref, decode);
    node.client.readContent = (cid, ref, sequence, decode) =>
      sources.get(ref.identity)!.readContent(cid, ref, sequence, decode);
    node.client.enumerate = (owner, prefix) => sources.get(owner)!.enumerate(owner, prefix);
  }
  const participants = nodes.map((node) => {
    const repository = new ReplyRepository(node.client);
    return {
      node,
      repository,
      service: new ReplyService(node.identity, node.client, repository, async () => true)
    };
  });
  const [bob, alice, carol] = participants;
  let count = 0;
  async function reply(person: typeof bob, parent: string) {
    const id = `reply_${++count}`;
    await person.service.submit({
      id,
      postId: "post",
      postAuthor: bob.node.identity,
      parent,
      body: id,
      createdAt: "2026-09-07T00:00:00Z"
    });
    for (const sent of person.node.sent.splice(0))
      bob.node.deliverIngress({ sender: person.node.identity, body: sent.body });
    await bob.service.inbox.review(
      [alice, carol].map((person) => ({
        identity: person.node.identity,
        displayName: "",
        relationship: "accepted"
      }))
    );
    return id;
  }
  const first = await reply(bob, "post");
  await reply(bob, first);
  await reply(alice, "post");
  await reply(carol, "post");
  const visible = (await bob.repository.load(bob.node.identity, "post")).replies;
  for (const parent of visible) {
    await reply(alice, parent.id);
    await reply(carol, parent.id);
  }
  const trees = await Promise.all(
    participants.map((person) => person.repository.load(bob.node.identity, "post"))
  );
  expect(trees[0].replies).toHaveLength(12);
  expect(trees[0].unavailable).toBe(0);
  expect(trees[1]).toEqual(trees[0]);
  expect(trees[2]).toEqual(trees[0]);
});
