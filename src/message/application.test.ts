import { expect, it, vi } from "vitest";
import { createFakeJolt } from "jolt-sdk/testing";
import { createMessagesApplication } from "./application";

it("resolves conversation names from profiles without replacing the saved contact", async () => {
  const node = createFakeJolt("alice.jolt");
  await node.client.publishEncryptedJson(
    "/spoke/contacts/bob",
    {
      schema: "spoke.contact.v1",
      identity: "bob.jolt",
      displayName: "bob",
      relationship: "accepted",
      updatedAt: "2026-09-07T00:00:00Z"
    },
    [node.identity]
  );
  const read = vi.fn(async (ref, decode) => ({
    ref,
    contentId: "bob-profile",
    latestSequence: 1,
    value: decode({
      schema: "spoke.profile.v2",
      identity: "bob.jolt",
      displayName: "Bob Laptop",
      bio: "",
      updatedAt: "2026-09-07T00:00:00Z"
    })
  }));
  const app = createMessagesApplication(
    node.identity,
    { ...node.client, read },
    { upload: vi.fn(), load: vi.fn() }
  );
  const data = await app.load();
  const named = await app.resolveNames!(data);
  expect(named.conversations[0]).toMatchObject({ name: "Bob Laptop", canSend: true });
  expect(named.contacts[0].displayName).toBe("bob");
  await app.resolveNames!(data);
  expect(read).toHaveBeenCalledTimes(1);
});
it("does not describe requests recognized by another inbox feature as unknown messages", async () => {
  const node = createFakeJolt("alice.jolt");
  node.deliverIngress({ sender: "bob.jolt", body: { schema: "spoke.reply_request.v1" } });
  const app = createMessagesApplication(
    node.identity,
    node.client,
    { upload: vi.fn(), load: vi.fn() },
    { reviewInbox: async () => 1 }
  );
  expect((await app.load()).pendingCount).toBe(0);
  expect(await node.client.listPendingIngress()).toHaveLength(1);
});

it("keeps a chosen nickname and does not fetch its profile", async () => {
  const node = createFakeJolt("alice.jolt");
  await node.client.publishEncryptedJson(
    "/spoke/contacts/bob",
    {
      schema: "spoke.contact.v1",
      identity: "bob.jolt",
      displayName: "My brother",
      relationship: "accepted",
      updatedAt: "2026-09-07T00:00:00Z"
    },
    [node.identity]
  );
  const read = vi.spyOn(node.client, "read");
  const app = createMessagesApplication(node.identity, node.client, {
    upload: vi.fn(),
    load: vi.fn()
  });
  expect((await app.resolveNames!(await app.load())).conversations[0].name).toBe("My brother");
  expect(read).not.toHaveBeenCalled();
});
