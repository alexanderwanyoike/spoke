import { describe, expect, it } from "vitest";
import {
  displayNameForProfileIdentity,
  normalizeProfileDraft,
  profileCacheKey,
  profileLinksFromDraft
} from "./model";

describe("Spoke profile helpers", () => {
  it("normalizes old profile drafts into the rich profile draft shape", () => {
    expect(normalizeProfileDraft({ displayName: "Alice", bio: "Hi" })).toEqual({
      displayName: "Alice",
      bio: "Hi",
      location: "",
      pronouns: "",
      links: [],
      avatar: undefined
    });
  });

  it("uses local nicknames ahead of fetched profile display names", () => {
    expect(
      displayNameForProfileIdentity({
        identity: "alice.jolt",
        contacts: [{ identity: "alice.jolt", displayName: "Al", relationship: "accepted" }],
        profiles: {
          "alice.jolt": {
            schema: "spoke.profile.v2",
            identity: "alice.jolt",
            displayName: "Alice Remote",
            bio: "",
            updatedAt: "2026-06-16T10:00:00.000Z"
          }
        }
      })
    ).toBe("Al");
  });

  it("falls back to the fetched profile when no nickname exists", () => {
    expect(
      displayNameForProfileIdentity({
        identity: "alice.jolt",
        contacts: [{ identity: "alice.jolt", displayName: "", relationship: "accepted" }],
        profiles: {
          "alice.jolt": {
            schema: "spoke.profile.v1",
            identity: "alice.jolt",
            displayName: "Alice Remote",
            bio: "",
            updatedAt: "2026-06-16T10:00:00.000Z"
          }
        }
      })
    ).toBe("Alice Remote");
  });

  it("does not let a generated identity fallback hide the fetched profile name", () => {
    expect(
      displayNameForProfileIdentity({
        identity: "bob.jolt",
        contacts: [{ identity: "bob.jolt", displayName: "bob.jolt", relationship: "accepted" }],
        profiles: {
          bob: {
            schema: "spoke.profile.v1",
            identity: "bob.jolt",
            displayName: "Bob",
            bio: "",
            updatedAt: "2026-08-31T10:00:00.000Z"
          }
        }
      })
    ).toBe("Bob");
  });

  it("keeps an intentional nickname that resembles the contact identity", () => {
    expect(
      displayNameForProfileIdentity({
        identity: "bob.jolt",
        contacts: [{ identity: "bob.jolt", displayName: "bob", relationship: "accepted" }],
        profiles: {
          bob: {
            schema: "spoke.profile.v1",
            identity: "bob.jolt",
            displayName: "Robert",
            bio: "",
            updatedAt: "2026-08-31T10:00:00.000Z"
          }
        }
      })
    ).toBe("bob");
  });

  it("keeps only complete profile links", () => {
    expect(
      profileLinksFromDraft([
        { label: "Site", url: " https://example.com " },
        { label: "", url: "https://missing-label.example" },
        { label: "No URL", url: "" }
      ])
    ).toEqual([{ label: "Site", url: "https://example.com" }]);
  });

  it("uses the same cache key for identity aliases", () => {
    expect(profileCacheKey("alice.jolt")).toBe(profileCacheKey("alice"));
  });
});
