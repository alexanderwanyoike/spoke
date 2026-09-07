import { expect, it, vi } from "vitest";
import { createDataClient } from "jolt-sdk";
import { participant } from "./participant";
import { SpokeData } from "../../src/data";
import { openPost } from "../../src/home/post-document";
import { ReplyRepository } from "../../src/replies/repository";
import { ReplyService } from "../../src/replies/service";

it.skipIf(process.env.SPOKE_INTEGRATION !== "1")(
  "publishes, reviews and reads a nested public conversation across two real nodes",
  async () => {
    const alice = await participant(Number(process.env.SPOKE_ALICE_PORT));
    const bob = await participant(Number(process.env.SPOKE_BOB_PORT));
    const data = await SpokeData.connect({
      identity: alice.identity,
      client: createDataClient({
        transport: alice.sdk.transport,
        getSessionToken: () => alice.token
      })
    });
    const post = await data.posts.create({
      author: alice.identity,
      title: "",
      body: "A public conversation",
      createdAt: new Date()
    });
    const postId = post.ref.path.split("/").pop()!;
    const exists = async (owner: string, id: string) =>
      (await openPost(data, alice.identity, owner, id)).kind === "ready";
    const aliceRepository = new ReplyRepository(alice.sdk);
    const bobRepository = new ReplyRepository(bob.sdk);
    const aliceService = new ReplyService(alice.identity, alice.sdk, aliceRepository, exists);
    const bobService = new ReplyService(bob.identity, bob.sdk, bobRepository, exists);
    const draft = {
      id: `reply_${crypto.randomUUID()}`,
      postId,
      postAuthor: alice.identity,
      parent: postId,
      body: "Alice's opening thought",
      createdAt: new Date().toISOString()
    };
    await aliceService.submit(draft);
    await bobService.submit({
      ...draft,
      id: `reply_${crypto.randomUUID()}`,
      parent: draft.id,
      body: "Bob's nested reply"
    });
    await vi.waitFor(
      async () => {
        await aliceService.inbox.review([]);
        expect(aliceService.inbox.getSnapshot().requests).toHaveLength(1);
      },
      { timeout: 45000, interval: 200 }
    );
    const request = aliceService.inbox.getSnapshot().requests[0];
    await aliceService.inbox.decide(request.ingressId, "accepted");
    const fromAlice = await aliceRepository.load(alice.identity, postId);
    expect(fromAlice.roots[0].children[0].reply.body).toBe("Bob's nested reply");
    await vi.waitFor(
      async () => expect(await bobRepository.load(alice.identity, postId)).toEqual(fromAlice),
      { timeout: 45000, interval: 200 }
    );
    expect((await bobRepository.submitted(bob.identity, alice.identity, postId))[0].body).toBe(
      "Bob's nested reply"
    );
  },
  120000
);
