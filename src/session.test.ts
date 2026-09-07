import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());
const isTauriMock = vi.hoisted(() => vi.fn(() => false));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  isTauri: isTauriMock
}));

import { SPOKE_CAPABILITIES, requestSpokeSession } from "./session";
import { SPOKE_COMPATIBILITY } from "./jolt";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init
  });
}

describe("Spoke session bootstrap", () => {
  beforeEach(() => {
    isTauriMock.mockReturnValue(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: true }))
    );
  });

  afterEach(() => {
    invokeMock.mockReset();
    isTauriMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("requests a session with Spoke's app identity and social + ingress capabilities", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ request_id: "req_1", status: "pending" })
    );

    await expect(requestSpokeSession("alice.jolt")).resolves.toEqual({
      request_id: "req_1",
      status: "pending"
    });

    expect(fetch).toHaveBeenCalledWith(
      "/jolt-api/sessions/request",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_id: "spoke.local",
          app_name: "Spoke",
          app_origin: "http://127.0.0.1:5178",
          requested_identity: "alice.jolt",
          requested_capabilities: SPOKE_CAPABILITIES
        })
      })
    );
  });

  it("requests the authority and App API features declared by SpokeData", () => {
    expect(SPOKE_CAPABILITIES).toEqual(
      expect.arrayContaining([
        "publish:/spoke/*",
        "delete:/spoke/posts/*",
        "subscribe:any:/spoke/posts/*"
      ])
    );
    expect(SPOKE_COMPATIBILITY.requiredFeatures).toEqual({
      "data.records": 5,
      "data.subscriptions": 1,
      "data.change-streams": 1
    });
  });
});
