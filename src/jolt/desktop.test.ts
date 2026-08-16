import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true)
}));

vi.mock("@tauri-apps/api/core", () => tauri);

describe("Spoke desktop Jolt adapter", () => {
  beforeEach(() => {
    vi.resetModules();
    tauri.invoke.mockReset();
    tauri.isTauri.mockReturnValue(true);
    vi.stubGlobal("window", { __TAURI_INTERNALS__: { invoke: tauri.invoke } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("routes daemon operations through the shared Jolt plugin", async () => {
    tauri.invoke.mockResolvedValueOnce({
      identity_address: "alice.jolt",
      peer_id: "peer-alice",
      connected_peers: 0
    });
    const { getStatus } = await import("./index");

    await getStatus();

    expect(tauri.invoke.mock.calls[0]?.[0]).toBe("plugin:jolt|daemon_request");
    expect(tauri.invoke.mock.calls[0]?.[1]).toEqual({
      basePath: "/api/v1",
      path: "/status",
      method: "GET",
      body: null,
      sessionToken: null
    });
  });

});
