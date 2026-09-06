import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createJoltClient, operations } from "jolt-sdk";
import { HttpTransport } from "jolt-sdk/transport-http";
import { createMessagesApplication } from "../../src/message/application";
import { createMessageMedia } from "../../src/message/media-repository";
import { SPOKE_CAPABILITIES } from "../../src/session";

// Run only against disposable nodes explicitly launched by the integration harness.
const enabled = process.env.SPOKE_INTEGRATION === "1";
async function participant(port: number) {
  const url = `http://127.0.0.1:${port}`;
  const transport = new HttpTransport({ daemonUrl: url });
  const anonymous = createJoltClient({ transport, getSessionToken: () => "" });
  const { identity_address: identity } = await anonymous.getStatus();
  const request = await anonymous.requestSession({
    appId: "spoke.local",
    appName: "Spoke integration test",
    appOrigin: "http://127.0.0.1:5180",
    identity,
    capabilities: SPOKE_CAPABILITIES
  });
  const approval = await fetch(`${url}/admin/v1/app-requests/${request.request_id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity, capabilities: SPOKE_CAPABILITIES, expires_at: null })
  });
  expect(approval.ok).toBe(true);
  const { session_token: token } = await approval.json();
  const sdk = createJoltClient({ transport, getSessionToken: () => token });
  const media = createMessageMedia(identity, token, {
    publish: async (session, path, file, options) =>
      operations.publishEncryptedBytes(
        transport,
        session,
        path,
        new Uint8Array(await file.arrayBuffer()),
        options
      ),
    decrypt: (session, target) => operations.decryptEncryptedTarget(transport, session, target)
  });
  if (process.env.SPOKE_INTEGRATION_DIR)
    await writeFile(
      join(process.env.SPOKE_INTEGRATION_DIR, `${port}-access.json`),
      JSON.stringify({ identity, token, requestId: request.request_id, status: "active" }),
      { mode: 0o600 }
    );
  return {
    identity,
    sdk,
    token,
    requestId: request.request_id,
    app: createMessagesApplication(identity, sdk, media),
    reopen: () => createMessagesApplication(identity, sdk, media)
  };
}

it.skipIf(!enabled)(
  "connects two fresh identities, exchanges encrypted text and an image, then reloads both histories",
  async () => {
    const alice = await participant(Number(process.env.SPOKE_ALICE_PORT));
    const bob = await participant(Number(process.env.SPOKE_BOB_PORT));
    await alice.app.contacts.request({ identity: bob.identity, displayName: "Bob" });
    const requests = (await bob.app.load()).contactRequests!;
    expect(requests).toHaveLength(1);
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
