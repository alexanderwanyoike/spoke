import { describe, expect, it } from "vitest";
import type { SpokeFollowRequest } from "../follow";
import { incomingPreview, incomingSenderName } from "./preview";

function request(overrides: Partial<SpokeFollowRequest> = {}): SpokeFollowRequest {
  return {
    schema: "spoke.follow_request.v1",
    id: "follow_req_1",
    sender: "carol.jolt",
    recipient: "alice.jolt",
    displayName: "Carol",
    message: "",
    createdAt: "2026-06-18T10:00:00.000Z",
    ...overrides
  };
}

describe("incoming follow request presentation", () => {
  it("names the sender by their declared display name", () => {
    expect(incomingSenderName(request())).toBe("Carol");
    expect(incomingPreview(request())).toBe("Carol wants to follow you.");
  });

  it("falls back to the identity when the sender declared no real name", () => {
    expect(incomingSenderName(request({ displayName: "" }))).toBeUndefined();
    expect(incomingSenderName(request({ displayName: "carol.jolt" }))).toBeUndefined();
    expect(incomingPreview(request({ displayName: "carol.jolt" }))).toBe(
      "carol.jolt wants to follow you."
    );
  });

  it("prefers the sender's own message when there is one", () => {
    expect(incomingPreview(request({ message: "Hi, it's me from the meetup" }))).toBe(
      "Hi, it's me from the meetup"
    );
  });
});
