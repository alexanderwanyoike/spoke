import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

describe("Spoke desktop Jolt adapter", () => {
  beforeEach(() => {
    vi.resetModules();
    invoke.mockReset();
    vi.stubGlobal("window", { __TAURI_INTERNALS__: { invoke } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("routes daemon operations through the shared Jolt plugin", async () => {
    invoke.mockResolvedValueOnce({
      identity_address: "alice.jolt",
      peer_id: "peer-alice",
      connected_peers: 0
    });
    const { getStatus } = await import("./index");

    await getStatus();

    expect(invoke.mock.calls[0]?.[0]).toBe("plugin:jolt|daemon_request");
    expect(invoke.mock.calls[0]?.[1]).toEqual({
      basePath: "/api/v1",
      path: "/status",
      method: "GET",
      body: null,
      sessionToken: null
    });
  });
});
