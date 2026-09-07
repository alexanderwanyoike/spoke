import { expect, it, vi } from "vitest";
import { createStore } from "../common/store";
import { ContactService } from "./service";
import { readContacts } from "../follow";

function fixture() {
  const store = createStore();
  const request = {
    schema: "spoke.follow_request.v1",
    id: "request",
    sender: "bob",
    recipient: "alice",
    displayName: "Bob",
    message: "Hello",
    createdAt: "2026-09-06T12:00:00Z"
  };
  const sdk = {
    listPublished: vi.fn().mockResolvedValue([]),
    readEncrypted: vi.fn().mockResolvedValue(null),
    listPendingIngress: vi.fn().mockResolvedValue([
      {
        ingress_id: "inbox",
        sender_identity: "bob",
        recipient_identity: "alice",
        schema_hint: request.schema
      }
    ]),
    openIngress: vi.fn().mockResolvedValue(request),
    sendObject: vi.fn().mockResolvedValue({ latestSequence: 1 }),
    publishEncryptedJson: vi.fn().mockResolvedValue({ latestSequence: 1 }),
    acceptIngress: vi.fn().mockResolvedValue(undefined),
    rejectIngress: vi.fn().mockResolvedValue(undefined)
  };
  const service = new ContactService(sdk as never, "alice", store);
  return { service, sdk, store, request };
}
it("accepts a verified request, persists the contact and acknowledges only after publication", async () => {
  const { service, sdk, store } = fixture();
  expect(await service.review()).toMatchObject([
    { ingressId: "inbox", request: { sender: "bob" } }
  ]);
  await service.decide("inbox", "accepted");
  expect(readContacts("alice", store)).toMatchObject([
    { identity: "bob", relationship: "accepted" }
  ]);
  expect(sdk.sendObject).toHaveBeenCalledWith(
    "bob",
    expect.any(String),
    expect.objectContaining({ decision: "accepted" })
  );
  expect(sdk.acceptIngress).toHaveBeenCalledWith("inbox");
});
it("does not offer or accept an impersonated request", async () => {
  const { service, sdk, request } = fixture();
  sdk.openIngress.mockResolvedValue({ ...request, sender: "carol" });
  expect(await service.review()).toEqual([]);
  await expect(service.decide("inbox", "accepted")).rejects.toThrow();
  expect(sdk.sendObject).not.toHaveBeenCalled();
});
it("keeps a request pending when its accepted contact cannot be persisted", async () => {
  const { service, sdk } = fixture();
  sdk.publishEncryptedJson.mockRejectedValueOnce(new Error("Offline"));
  await expect(service.decide("inbox", "accepted")).rejects.toThrow("Offline");
  expect(sdk.acceptIngress).not.toHaveBeenCalled();
});
it("rejects self requests before any network write", async () => {
  const { service, sdk } = fixture();
  await expect(service.request({ identity: "alice", displayName: "Me" })).rejects.toThrow();
  expect(sdk.sendObject).not.toHaveBeenCalled();
});

it("finds contact requests without optional envelope hints", async () => {
  const { service, sdk } = fixture();
  sdk.listPendingIngress.mockResolvedValue([
    { ingress_id: "inbox", sender_identity: "bob", recipient_identity: "alice", schema_hint: null }
  ] as never);
  expect(await service.review()).toHaveLength(1);
});
it("does not downgrade an accepted contact by requesting them again", async () => {
  const { service, sdk, store } = fixture();
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
  await expect(service.request({ identity: "bob.jolt", displayName: "Bob" })).rejects.toThrow(
    "already"
  );
  expect(sdk.sendObject).not.toHaveBeenCalled();
});

it("sends the introduction and sender name without replacing the recipient's local nickname", async () => {
  const { service, sdk, store } = fixture();
  await service.request({
    identity: "bob",
    displayName: "Bob at the bookshop",
    fromDisplayName: "Alice",
    message: "Good to meet you."
  });
  expect(sdk.sendObject).toHaveBeenCalledWith(
    "bob",
    expect.any(String),
    expect.objectContaining({ displayName: "Alice", message: "Good to meet you." })
  );
  expect(readContacts("alice", store)).toMatchObject([
    { identity: "bob", displayName: "Bob at the bookshop", relationship: "requested" }
  ]);
});
