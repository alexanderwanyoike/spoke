import { expect, it } from "vitest";
import { createFakeJolt } from "jolt-sdk/testing";
import { ActivityRepository } from "./repository";

it("persists read state and accepted contact events privately for the current identity", async () => {
  const node = createFakeJolt("alice.jolt");
  const repository = new ActivityRepository(node.identity, node.client);
  await repository.contactAccepted({
    schema: "spoke.follow_response.v1",
    id: "response",
    requestId: "request",
    sender: "bob.jolt",
    recipient: node.identity,
    decision: "accepted",
    createdAt: "2026-09-07T00:00:00Z"
  });
  await repository.markRead(["contact/request"]);
  const reloaded = await new ActivityRepository(node.identity, node.client).load();
  expect(reloaded.contacts).toMatchObject([{ id: "contact/request", actor: "bob.jolt" }]);
  expect(reloaded.read.has("contact/request")).toBe(true);
  for (const published of await node.client.listPublished()) {
    expect(
      await node.client.read({ identity: node.identity, path: published.path! }, (value) => value)
    ).toBeNull();
    expect(node.encryptedRecipients.get(published.path!)).toEqual([node.identity]);
  }
});

it("reports an unreadable saved marker instead of silently declaring its event unread again", async () => {
  const node = createFakeJolt("alice.jolt");
  const repository = new ActivityRepository(node.identity, node.client);
  await repository.markRead(["message/one"]);
  node.client.readEncrypted = async () => null;
  await expect(repository.load()).rejects.toThrow("could not be opened");
});
