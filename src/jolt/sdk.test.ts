import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const isTauriMock = vi.hoisted(() => vi.fn(() => false));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: isTauriMock
}));

import { createJoltSdk } from "./index";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init
  });
}

describe("Jolt SDK ACL", () => {
  beforeEach(() => {
    isTauriMock.mockReturnValue(false);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    isTauriMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("decrypts encrypted references by address, not by resolved content id", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          address: "alice.jolt/spoke/contacts/bob",
          identity: "alice",
          path: "/spoke/contacts/bob",
          latest_sequence: 5,
          content_id: "cid_contact",
          reachability_hints: [],
          source: "device_writer_cache"
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          content_id: "cid_contact",
          path: "/spoke/contacts/bob",
          plaintext: Array.from(
            new TextEncoder().encode(
              JSON.stringify({
                schema: "spoke.contact.v1",
                identity: "bob.jolt",
                displayName: "Bob",
                relationship: "accepted",
                updatedAt: "2026-06-18T12:00:00.000Z"
              })
            )
          ),
          size: 160,
          content_type: "application/json"
        })
      );

    const sdk = createJoltSdk(() => "token-1");
    const hit = await sdk.readEncrypted(
      { identity: "alice.jolt", path: "/spoke/contacts/bob" },
      (value) => value
    );

    expect(hit?.contentId).toBe("cid_contact");
    expect(hit?.latestSequence).toBe(5);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/jolt-api/encrypted/decrypt",
      expect.objectContaining({
        body: JSON.stringify({ target: "alice.jolt/spoke/contacts/bob" })
      })
    );
  });
});
