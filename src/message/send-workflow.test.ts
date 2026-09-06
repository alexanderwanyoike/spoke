import { expect, it, vi } from "vitest";
import { createMessageSender } from "./send-workflow";
import { createStore } from "../common/store";
import type { MessageDraft } from "./drafts";
const draft: MessageDraft = { id: "one", body: "Hello", images: [] };

it("retains the message identity and timestamp across a failed ingress retry", async () => {
  const sendObject = vi
    .fn()
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValue({ latestSequence: 1 });
  const sender = createMessageSender({
    identity: "alice",
    sdk: { sendObject },
    store: createStore(),
    authorize: async () => {},
    upload: vi.fn()
  });
  await expect(sender.send("bob", draft)).rejects.toThrow("Offline");
  await sender.send("bob", draft);
  expect(sendObject.mock.calls[1][2]).toEqual(sendObject.mock.calls[0][2]);
  expect(sender.confirmed.has("one")).toBe(true);
});

it("refuses a non-contact before publishing media or sending", async () => {
  const sendObject = vi.fn();
  const upload = vi.fn();
  const sender = createMessageSender({
    identity: "alice",
    sdk: { sendObject },
    store: createStore(),
    authorize: async () => {
      throw new Error("Not an accepted contact");
    },
    upload
  });
  await expect(sender.send("carol", draft)).rejects.toThrow("Not an accepted contact");
  expect(upload).not.toHaveBeenCalled();
  expect(sendObject).not.toHaveBeenCalled();
});

it("does not send after its session ends during authorization", async () => {
  const session = new AbortController();
  const sendObject = vi.fn();
  const sender = createMessageSender({
    identity: "alice",
    sdk: { sendObject },
    store: createStore(),
    authorize: async () => {
      session.abort();
    },
    upload: vi.fn()
  });
  await expect(sender.send("bob", draft, session.signal)).rejects.toThrow();
  expect(sendObject).not.toHaveBeenCalled();
});
