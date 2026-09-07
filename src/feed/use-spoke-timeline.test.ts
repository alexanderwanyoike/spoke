import { describe, expect, it } from "vitest";

import type { Contact } from "./model";
import { feedScopeKey } from "./use-spoke-timeline";

function contact(identity: string): Contact {
  return { identity, displayName: identity, relationship: "accepted" };
}

describe("feed timeline scope", () => {
  it("depends on the source set rather than contact array order or duplicates", () => {
    const first = {
      localIdentity: "viewer.jolt",
      contacts: [contact("alice.jolt"), contact("bob.jolt")]
    };
    const sameSources = {
      localIdentity: "viewer.jolt",
      contacts: [contact("bob.jolt"), contact("alice.jolt"), contact("alice.jolt")]
    };

    expect(feedScopeKey(sameSources)).toBe(feedScopeKey(first));
  });
});
