import { expect, it, vi } from "vitest";
import { createFakeJolt } from "jolt-sdk/testing";
import { createMessagesApplication } from "./application";
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
