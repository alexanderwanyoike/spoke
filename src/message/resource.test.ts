import { expect, it, vi } from "vitest";
import { createMessagesResource } from "./resource";
import type { MessagesData } from "./view-model";
const data: MessagesData = {
  conversations: [],
  pendingCount: 0,
  contacts: [],
  contactRequests: [],
  requestedContacts: []
};

it("shows messages before profile lookup completes and ignores stale profile results", async () => {
  let finish!: (value: MessagesData) => void;
  const names = vi.fn(
    () =>
      new Promise<MessagesData>((resolve) => {
        finish = resolve;
      })
  );
  const resource = createMessagesResource(async () => data, names);
  await resource.refresh();
  expect(resource.getSnapshot()).toMatchObject({ status: "ready", data });
  resource.stop();
  finish({ ...data, pendingCount: 99 });
  await Promise.resolve();
  expect(resource.getSnapshot().data.pendingCount).toBe(0);
});

it("coalesces refreshes and keeps the last successful data on failure", async () => {
  let finish!: (data: MessagesData) => void;
  const load = vi.fn(
    () =>
      new Promise<MessagesData>((resolve) => {
        finish = resolve;
      })
  );
  const resource = createMessagesResource(load);
  const first = resource.refresh();
  const second = resource.refresh();
  expect(load).toHaveBeenCalledTimes(1);
  finish(data);
  await Promise.all([first, second]);
  expect(resource.getSnapshot()).toMatchObject({ status: "ready", data });
  load.mockRejectedValueOnce(new Error("Offline"));
  await resource.refresh();
  expect(resource.getSnapshot()).toMatchObject({ status: "stale", data, error: "Offline" });
  load.mockResolvedValueOnce(data);
  await resource.refresh();
  expect(resource.getSnapshot()).toMatchObject({ status: "ready", error: "" });
});

it("ignores a response after the session has stopped", async () => {
  let finish!: (data: MessagesData) => void;
  const resource = createMessagesResource(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const listener = vi.fn();
  resource.subscribe(listener);
  const pending = resource.refresh();
  resource.stop();
  const before = listener.mock.calls.length;
  finish(data);
  await pending;
  expect(listener).toHaveBeenCalledTimes(before);
  expect(resource.getSnapshot().status).toBe("loading");
});

it("applies resolved labels without requiring another inbox poll", async () => {
  const named = { ...data, conversations: [{ id: "thread", name: "Bob" }] } as MessagesData;
  const resource = createMessagesResource(
    async () => data,
    async () => named
  );
  await resource.refresh();
  expect(resource.getSnapshot().data).toBe(named);
});

it("does not let an older profile response overwrite a newer message snapshot", async () => {
  let finish!: (value: MessagesData) => void;
  const names = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    )
    .mockImplementationOnce(async (value) => value);
  const newer = { ...data, pendingCount: 1 };
  const load = vi.fn().mockResolvedValueOnce(data).mockResolvedValueOnce(newer);
  const resource = createMessagesResource(load, names);
  await resource.refresh();
  await resource.refresh();
  finish(data);
  await Promise.resolve();
  expect(resource.getSnapshot().data).toBe(newer);
});
