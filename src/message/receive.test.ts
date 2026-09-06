import { expect, it, vi } from "vitest";
import { createStore } from "../common/store";
import { receiveMessages } from "./receive";
import type { IngressRecord } from "../jolt";
const message = {
  schema: "spoke.message.v2",
  id: "incoming",
  conversationId: "conv_alice_bob",
  sender: "bob",
  recipients: ["alice"],
  body: "Hello",
  createdAt: "2026-09-06T12:00:00.000Z"
};
function fixture() {
  const store = createStore();
  store.upsert({
    identity: "alice",
    path: "/spoke/contacts/bob",
    latestSequence: 1,
    contentId: "contact",
    value: {
      schema: "spoke.contact.v1",
      identity: "bob",
      displayName: "Bob",
      relationship: "accepted",
      updatedAt: "today"
    }
  });
  const record = {
    ingress_id: "envelope",
    sender_identity: "bob",
    recipient_identity: "alice",
    schema_hint: "spoke.message.v2"
  } as IngressRecord;
  const sdk = {
    listPendingIngress: vi.fn().mockResolvedValue([record]),
    openIngress: vi.fn().mockResolvedValue(message),
    publishEncryptedJson: vi.fn().mockResolvedValue({ latestSequence: 1 }),
    acceptIngress: vi.fn().mockResolvedValue(undefined)
  };
  return { store, sdk, record };
}
it("rejects an envelope whose payload impersonates another sender", async () => {
  const { store, sdk } = fixture();
  sdk.openIngress.mockResolvedValueOnce({
    ...message,
    sender: "carol",
    conversationId: "conv_alice_carol"
  });
  expect(await receiveMessages(sdk, "alice", store)).toBe(1);
  expect(sdk.publishEncryptedJson).not.toHaveBeenCalled();
  expect(sdk.acceptIngress).not.toHaveBeenCalled();
});
it("retries acknowledgement without publishing a received copy again", async () => {
  const { store, sdk } = fixture();
  sdk.acceptIngress.mockRejectedValueOnce(new Error("Offline"));
  await expect(receiveMessages(sdk, "alice", store)).rejects.toThrow("Offline");
  await receiveMessages(sdk, "alice", store);
  expect(sdk.publishEncryptedJson).toHaveBeenCalledTimes(1);
  expect(sdk.acceptIngress).toHaveBeenCalledTimes(2);
});
