import { afterEach, expect, it, vi } from "vitest";
import { createFakeJolt } from "jolt-sdk/testing";
import { createProfileNames } from "./names";

const profile = {
  schema: "spoke.profile.v2",
  identity: "bob.jolt",
  displayName: "Bob Laptop",
  bio: "",
  updatedAt: "2026-09-07T00:00:00Z"
};
afterEach(() => vi.useRealTimers());

it("retains a verified name during an outage and refreshes it after the retry interval", async () => {
  vi.useFakeTimers();
  const node = createFakeJolt("bob.jolt");
  await node.client.publishJson("/spoke/profile", profile);
  const read = vi.spyOn(node.client, "read");
  const names = createProfileNames(node.client);
  expect((await names.load(["bob", "bob.jolt"])).get("bob")).toBe("Bob Laptop");
  expect(read).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledWith(
    { identity: "bob.jolt", path: "/spoke/profile" },
    expect.any(Function),
    { timeoutMs: 2_500 }
  );
  read.mockRejectedValueOnce(new Error("Offline"));
  vi.advanceTimersByTime(60_001);
  expect((await names.load(["bob"])).get("bob")).toBe("Bob Laptop");
  await node.client.publishJson("/spoke/profile", { ...profile, displayName: "Robert" });
  vi.advanceTimersByTime(60_001);
  expect((await names.load(["bob"])).get("bob")).toBe("Robert");
});

it.each([null, { ...profile, identity: "mallory" }, { ...profile, displayName: "   " }])(
  "does not invent a name from missing, mismatched or blank profiles",
  async (value) => {
    const node = createFakeJolt("bob.jolt");
    if (value) await node.client.publishJson("/spoke/profile", value);
    expect((await createProfileNames(node.client).load(["bob"])).size).toBe(0);
  }
);

it("shares an in-flight lookup across concurrent requests", async () => {
  const node = createFakeJolt("bob.jolt");
  const read = vi.spyOn(node.client, "read");
  const names = createProfileNames(node.client);
  await Promise.all([names.load(["bob"]), names.load(["bob.jolt"])]);
  expect(read).toHaveBeenCalledTimes(1);
});
