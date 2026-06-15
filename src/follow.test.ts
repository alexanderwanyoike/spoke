import { describe, expect, it } from "vitest";
import {
  acceptedContactFromRequest,
  applyFollowResponse,
  requestContactFromDraft,
  sameIdentity,
  upsertContact,
  type SpokeFollowRequest,
  type SpokeFollowResponse
} from "./follow";
import type { Contact } from "./feed";

function request(overrides: Partial<SpokeFollowRequest>): SpokeFollowRequest {
  return {
    schema: "spoke.follow_request.v1",
    id: "follow_req_1",
    sender: "alice.jolt",
    recipient: "bob.jolt",
    displayName: "Alice",
    message: "Can I follow?",
    createdAt: "2026-06-15T10:00:00.000Z",
    ...overrides
  };
}

function response(overrides: Partial<SpokeFollowResponse>): SpokeFollowResponse {
  return {
    schema: "spoke.follow_response.v1",
    id: "follow_resp_1",
    requestId: "follow_req_1",
    sender: "bob.jolt",
    recipient: "alice.jolt",
    decision: "accepted",
    createdAt: "2026-06-15T10:01:00.000Z",
    ...overrides
  };
}

describe("Spoke follow helpers", () => {
  it("matches bare identity ids and .jolt addresses", () => {
    expect(sameIdentity("abc123", "abc123.jolt")).toBe(true);
    expect(sameIdentity("abc123.jolt", "def456.jolt")).toBe(false);
  });

  it("creates a requested contact from a sent follow request draft", () => {
    expect(requestContactFromDraft("bob.jolt", "Bobby")).toEqual({
      identity: "bob.jolt",
      displayName: "Bobby",
      relationship: "requested"
    });
  });

  it("upserts contacts by identity while preserving the newest relationship", () => {
    const existing: Contact = {
      identity: "bob.jolt",
      displayName: "Old Bob",
      relationship: "requested"
    };
    const next: Contact = {
      identity: "bob.jolt",
      displayName: "Bob",
      relationship: "accepted"
    };

    expect(upsertContact([existing], next)).toEqual([next]);
  });

  it("turns an incoming follow request into an accepted contact", () => {
    expect(acceptedContactFromRequest(request({ displayName: "Alice Local" }))).toEqual({
      identity: "alice.jolt",
      displayName: "Alice Local",
      relationship: "accepted"
    });
  });

  it("marks a requested contact accepted when a response is accepted", () => {
    const contacts: Contact[] = [
      { identity: "bob.jolt", displayName: "Bob", relationship: "requested" }
    ];

    expect(applyFollowResponse(contacts, response({ decision: "accepted" }))).toEqual([
      { identity: "bob.jolt", displayName: "Bob", relationship: "accepted" }
    ]);
  });

  it("removes a requested contact when a response is rejected", () => {
    const contacts: Contact[] = [
      { identity: "bob.jolt", displayName: "Bob", relationship: "requested" }
    ];

    expect(applyFollowResponse(contacts, response({ decision: "rejected" }))).toEqual([]);
  });
});
