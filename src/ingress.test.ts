import { describe, expect, it } from "vitest";
import type { IngressRecord } from "./api";
import { isKnownContactIngress, visibleManualIngress } from "./ingress";
import type { Contact } from "./feed";

function ingress(overrides: Partial<IngressRecord>): IngressRecord {
  return {
    ingress_id: "ing_1",
    receiver_id: "receiver_1",
    sender_identity: "bob.jolt",
    recipient_identity: "alice.jolt",
    schema_hint: "application/vnd.spoke.reply+json",
    status: "pending",
    received_at: 1,
    size: 100,
    ...overrides
  };
}

const contacts: Contact[] = [{ identity: "bob.jolt", displayName: "Bob" }];

describe("Spoke ingress policy", () => {
  it("recognises pending ingress from known contacts", () => {
    expect(isKnownContactIngress(ingress({}), contacts)).toBe(true);
  });

  it("keeps unknown ingress visible for manual review", () => {
    const unknown = ingress({ ingress_id: "ing_unknown", sender_identity: "mallory.jolt" });
    const known = ingress({ ingress_id: "ing_known", sender_identity: "bob.jolt" });

    expect(visibleManualIngress([unknown, known], contacts)).toEqual([unknown]);
  });
});
