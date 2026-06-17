import { describe, expect, it } from "vitest";
import { createStore } from "./store";

const PROFILE_PATH = "/spoke/profile";

function profileEntry(identity: string, latestSequence: number, displayName: string) {
  return {
    identity,
    path: PROFILE_PATH,
    latestSequence,
    contentId: `cid_${latestSequence}`,
    value: { identity, displayName }
  };
}

describe("monotonic projection store", () => {
  it("upserts by version and never downgrades", () => {
    const store = createStore();

    expect(store.upsert(profileEntry("alice.jolt", 5, "Alice v5"))).toBe(true);

    // An older sequence is a no-op and does not overwrite the newer value.
    expect(store.upsert(profileEntry("alice.jolt", 3, "Alice v3"))).toBe(false);
    expect(store.get({ identity: "alice.jolt", path: PROFILE_PATH })?.value).toEqual({
      identity: "alice.jolt",
      displayName: "Alice v5"
    });

    // The same sequence is idempotent (no downgrade, no spurious change).
    expect(store.upsert(profileEntry("alice.jolt", 5, "Alice v5b"))).toBe(false);

    // A newer sequence wins.
    expect(store.upsert(profileEntry("alice.jolt", 6, "Alice v6"))).toBe(true);
    expect(store.get({ identity: "alice.jolt", path: PROFILE_PATH })?.value).toEqual({
      identity: "alice.jolt",
      displayName: "Alice v6"
    });
  });

  it("reads are additive: a new reference never removes an existing one", () => {
    const store = createStore();
    store.upsert(profileEntry("alice.jolt", 1, "Alice"));
    store.upsert(profileEntry("bob.jolt", 1, "Bob"));

    expect(store.get({ identity: "alice.jolt", path: PROFILE_PATH })).toBeDefined();
    expect(store.get({ identity: "bob.jolt", path: PROFILE_PATH })).toBeDefined();
    expect(store.getByPrefix("alice.jolt", "/spoke/")).toHaveLength(1);
  });

  it("notifies subscribers and exposes a stable snapshot between changes", () => {
    const store = createStore();
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    const before = store.getSnapshot();
    store.upsert(profileEntry("alice.jolt", 1, "Alice"));
    const after = store.getSnapshot();

    expect(notifications).toBe(1);
    expect(after).not.toBe(before);
    // No change means a stable snapshot reference (safe for useSyncExternalStore).
    expect(store.getSnapshot()).toBe(after);

    // A rejected downgrade does not notify or churn the snapshot.
    store.upsert(profileEntry("alice.jolt", 1, "Alice again"));
    expect(notifications).toBe(1);
    expect(store.getSnapshot()).toBe(after);

    unsubscribe();
  });
});
