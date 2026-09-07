import { expect, it } from "vitest";
import { participant } from "./participant";
const enabled = process.env.SPOKE_INTEGRATION === "1";

it.skipIf(!enabled)(
  "connects two fresh identities, exchanges encrypted text and an image, then reloads both histories",
  async () => {
    const alice = await participant(Number(process.env.SPOKE_ALICE_PORT));
    const bob = await participant(Number(process.env.SPOKE_BOB_PORT));
    await alice.app.contacts.request({
      identity: bob.identity,
      displayName: "Bob",
      fromDisplayName: "Alice",
      message: "Good to meet you."
    });
    const requests = (await bob.app.load()).contactRequests!;
    expect(requests).toHaveLength(1);
    expect(requests[0].request).toMatchObject({
      displayName: "Alice",
      message: "Good to meet you."
    });
    await bob.app.contacts.decide(requests[0].ingressId, "accepted");
    expect((await alice.app.load()).conversations[0].canSend).toBe(true);
    const id = `integration_${Date.now()}`;
    await alice.app.send(bob.identity, { id, body: "Text sent through real Jolt", images: [] });
    expect(
      (await bob.app.load()).conversations[0].messages.map((item) => item.message.body)
    ).toContain("Text sent through real Jolt");
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1cAAAAASUVORK5CYII=",
      "base64"
    );
    await bob.app.send(alice.identity, {
      id: `${id}_image`,
      body: "Image reply",
      images: [
        {
          id: "photo",
          file: new File([png], "pixel.png", { type: "image/png" }),
          previewUrl: "",
          mimeType: "image/png",
          alt: "Integration test pixel"
        }
      ]
    });
    const received = (await alice.app.load()).conversations[0].messages.find(
      (item) => item.message.id === `${id}_image`
    )!;
    expect(received).toBeDefined();
    const image = await alice.app.loadImage(received.message.attachments![0]);
    expect(Buffer.from(await image.arrayBuffer())).toEqual(png);
    for (const person of [alice, bob]) {
      const reopened = await person.reopen().load();
      expect(reopened.conversations[0].messages.map((item) => item.message.id)).toEqual([
        id,
        `${id}_image`
      ]);
      const publicCopy = await person.sdk.read(
        {
          identity: person.identity,
          path: `/spoke/outgoing/${person === alice ? id : `${id}_image`}`
        },
        (value) => value
      );
      expect(JSON.stringify(publicCopy)).not.toContain("Text sent through real Jolt");
      expect(JSON.stringify(publicCopy)).not.toContain("Image reply");
    }
  },
  120_000
);
