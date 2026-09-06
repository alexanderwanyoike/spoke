import { describe, expect, it } from "vitest";
import type { IngressRecord } from "../jolt";
import { reconcileIngressRecords } from "./records";

function record(id: string, status: IngressRecord["status"] = "pending"): IngressRecord {
  return {
    ingress_id: id,
    receiver_id: "rx",
    sender_identity: "carol.jolt",
    recipient_identity: "alice.jolt",
    schema_hint: null,
    status,
    received_at: 0,
    size: 0
  };
}

describe("reconcileIngressRecords", () => {
  it("keeps the current array when the poll returns the same records", () => {
    const current = [record("a"), record("b")];
    expect(reconcileIngressRecords(current, [record("a"), record("b")])).toBe(current);
  });

  it("adopts the new array when a record arrives, leaves, or changes status", () => {
    const current = [record("a")];
    expect(reconcileIngressRecords(current, [record("a"), record("b")])).not.toBe(current);
    expect(reconcileIngressRecords(current, [])).not.toBe(current);
    expect(reconcileIngressRecords(current, [record("a", "accepted")])).not.toBe(current);
  });
});
