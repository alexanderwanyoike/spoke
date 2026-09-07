import { expect, it, vi } from "vitest";
import { createDataClient } from "jolt-sdk";
import { participant } from "./participant";
import { SpokeData } from "../../src/data";
import { createFeedTimeline } from "../../src/feed/timeline";
import { createPostPublisher } from "../../src/home/publisher";
import { openPost } from "../../src/home/post-document";

it.skipIf(process.env.SPOKE_INTEGRATION !== "1")(
  "shares a typed post through the live feed, then edits, deletes and restores it",
  async () => {
    const alice = await participant(Number(process.env.SPOKE_ALICE_PORT));
    const bob = await participant(Number(process.env.SPOKE_BOB_PORT));
    const aliceData = await SpokeData.connect({
      identity: alice.identity,
      client: createDataClient({
        transport: alice.sdk.transport,
        getSessionToken: () => alice.token
      })
    });
    const bobData = await SpokeData.connect({
      identity: bob.identity,
      client: createDataClient({ transport: bob.sdk.transport, getSessionToken: () => bob.token })
    });
    const published = await createPostPublisher(aliceData, alice.identity, {
      upload: vi.fn(),
      load: vi.fn()
    }).publish(
      {
        title: "",
        body: "A typed public post",
        website: "https://example.com/article",
        linkTitle: "A useful article"
      },
      [],
      "Alice"
    );
    const timeline = createFeedTimeline(bobData.posts);
    try {
      await timeline.open({
        localIdentity: bob.identity,
        contacts: [{ identity: alice.identity, displayName: "Alice", relationship: "accepted" }]
      });
      await vi.waitFor(
        () =>
          expect(
            timeline.getSnapshot().items.some((item) => item.post.body === "A typed public post")
          ).toBe(true),
        { timeout: 45000, interval: 200 }
      );
      const document = await openPost(
        aliceData,
        alice.identity,
        alice.identity,
        published.ref.path.split("/").pop()!
      );
      if (document.kind !== "ready" || !document.actions) throw new Error("Owned post unavailable");
      const edited = await document.actions.edit({
        title: "",
        body: "An edited public post",
        website: "",
        linkTitle: ""
      });
      const undo = await edited.actions!.remove();
      expect(
        (await openPost(aliceData, alice.identity, alice.identity, edited.item.post.id)).kind
      ).toBe("deleted");
      expect((await undo()).item.post.body).toBe("An edited public post");
    } finally {
      await timeline.close();
    }
  },
  120000
);
