import { describe, expect, it } from "vitest";
import type { JoltSdk, Reference } from "../jolt";
import { createStore } from "../common/store";
import { publishProfile, PROFILE_PATH } from "./commands";
import { loadProfile } from "./loaders";
import { selectProfile, selectProfiles } from "./queries";
import type { SpokeProfile } from "../api";

function profile(identity: string, displayName: string): SpokeProfile {
  return {
    schema: "spoke.profile.v2",
    identity,
    displayName,
    bio: "",
    updatedAt: "2026-06-17T10:00:00.000Z"
  };
}

function encode(value: unknown): number[] {
  return Array.from(new TextEncoder().encode(JSON.stringify(value)));
}

// A fakeable SDK adapter: the seam is an interface, so the domain is testable
// without touching the Jolt transport or the daemon.
function fakeSdk(
  overrides: Partial<JoltSdk> & {
    reads?: Record<string, { latestSequence: number; contentId: string; bytes: number[] }>;
  } = {}
): JoltSdk {
  const reads = overrides.reads || {};
  return {
    async publishJson(path) {
      return { contentId: `cid_${path}`, latestSequence: 1, path, address: null };
    },
    async read(ref: Reference, decode) {
      const hit = reads[`${ref.identity}${ref.path}`];
      if (!hit) {
        return null;
      }
      const value = decode(JSON.parse(new TextDecoder().decode(new Uint8Array(hit.bytes))));
      return value === null
        ? null
        : { ref, value, latestSequence: hit.latestSequence, contentId: hit.contentId };
    },
    ...overrides
  };
}

describe("profile commands", () => {
  it("publishProfile writes through the SDK and upserts the store", async () => {
    const store = createStore();
    let publishedPath = "";
    const sdk = fakeSdk({
      async publishJson(path) {
        publishedPath = path;
        return { contentId: "cid_pub", latestSequence: 4, path, address: null };
      }
    });

    await publishProfile(sdk, profile("alice.jolt", "Alice"), store);

    expect(publishedPath).toBe(PROFILE_PATH);
    expect(selectProfile(store.getSnapshot(), "alice.jolt")?.displayName).toBe("Alice");
  });

  it("a freshly published profile wins over an older cached read", async () => {
    const store = createStore();
    // An older read is already cached at sequence 9 (under the normalized
    // identity that every command writes through).
    store.upsert({
      identity: "alice",
      path: PROFILE_PATH,
      latestSequence: 9,
      contentId: "cid_old",
      value: profile("alice.jolt", "Old Alice")
    });

    // The daemon does not echo a sequence on publish (it is optional).
    const sdk = fakeSdk({
      async publishJson(path) {
        return { contentId: "cid_new", latestSequence: 0, path, address: null };
      }
    });

    await publishProfile(sdk, profile("alice.jolt", "New Alice"), store);

    expect(selectProfile(store.getSnapshot(), "alice.jolt")?.displayName).toBe("New Alice");
  });
});

describe("profile loaders", () => {
  it("loadProfile decodes the fetched bytes and upserts the store", async () => {
    const store = createStore();
    const sdk = fakeSdk({
      reads: {
        "bob.jolt/spoke/profile": {
          latestSequence: 2,
          contentId: "cid_bob",
          bytes: encode(profile("bob.jolt", "Bob"))
        }
      }
    });

    const loaded = await loadProfile(sdk, "bob.jolt", store);

    expect(loaded?.displayName).toBe("Bob");
    expect(selectProfile(store.getSnapshot(), "bob.jolt")?.displayName).toBe("Bob");
  });

  it("loadProfile skips objects that are not Spoke profiles", async () => {
    const store = createStore();
    const sdk = fakeSdk({
      reads: {
        "mallory.jolt/spoke/profile": {
          latestSequence: 1,
          contentId: "cid_junk",
          bytes: encode({ not: "a profile" })
        }
      }
    });

    expect(await loadProfile(sdk, "mallory.jolt", store)).toBeNull();
    expect(selectProfile(store.getSnapshot(), "mallory.jolt")).toBeUndefined();
  });

  it("a stale load cannot drop an already-confirmed profile", async () => {
    const store = createStore();
    store.upsert({
      identity: "carol",
      path: PROFILE_PATH,
      latestSequence: 7,
      contentId: "cid_fresh",
      value: profile("carol.jolt", "Fresh Carol")
    });

    const sdk = fakeSdk({
      reads: {
        "carol.jolt/spoke/profile": {
          latestSequence: 3,
          contentId: "cid_stale",
          bytes: encode(profile("carol.jolt", "Stale Carol"))
        }
      }
    });

    await loadProfile(sdk, "carol.jolt", store);

    expect(selectProfile(store.getSnapshot(), "carol.jolt")?.displayName).toBe("Fresh Carol");
  });
});

describe("profile queries", () => {
  it("selectProfiles projects every cached profile keyed by normalized identity", async () => {
    const store = createStore();
    const sdk = fakeSdk({
      reads: {
        "alice.jolt/spoke/profile": {
          latestSequence: 1,
          contentId: "cid_a",
          bytes: encode(profile("alice.jolt", "Alice"))
        }
      }
    });
    await loadProfile(sdk, "alice.jolt", store);
    await publishProfile(sdk, profile("bob.jolt", "Bob"), store);

    const profiles = selectProfiles(store.getSnapshot());
    expect(profiles["alice"].displayName).toBe("Alice");
    expect(profiles["bob"].displayName).toBe("Bob");
  });

  it("identity aliases resolve to the same projected profile", async () => {
    const store = createStore();
    await publishProfile(fakeSdk(), profile("alice.jolt", "Alice"), store);
    expect(selectProfile(store.getSnapshot(), "alice")?.displayName).toBe("Alice");
    expect(selectProfile(store.getSnapshot(), "alice.jolt")?.displayName).toBe("Alice");
  });
});
