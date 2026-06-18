import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());
const isTauriMock = vi.hoisted(() => vi.fn(() => false));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  isTauri: isTauriMock
}));

import {
  acceptIngress,
  decryptEncryptedTarget,
  fetchTarget,
  getStatus,
  listPendingIngress,
  openIngress,
  publishBinary,
  publishEncryptedBinary,
  publishJson,
  rejectIngress,
  requestSession,
  sendObjectByIdentity,
  type IngressRecord
} from "./transport";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init
  });
}

describe("Spoke daemon API client", () => {
  beforeEach(() => {
    isTauriMock.mockReturnValue(false);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ok: true })));
  });

  afterEach(() => {
    vi.useRealTimers();
    invokeMock.mockReset();
    isTauriMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("requests a session with the caller's app identity and capabilities", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ request_id: "req_1", status: "pending" })
    );

    await expect(
      requestSession({
        appId: "app.example",
        appName: "Example",
        appOrigin: "http://example",
        identity: "alice.jolt",
        capabilities: ["resolve:public", "ingress:read"]
      })
    ).resolves.toEqual({ request_id: "req_1", status: "pending" });

    expect(fetch).toHaveBeenCalledWith(
      "/jolt-api/sessions/request",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_id: "app.example",
          app_name: "Example",
          app_origin: "http://example",
          requested_identity: "alice.jolt",
          requested_capabilities: ["resolve:public", "ingress:read"]
        })
      })
    );
  });

  it("uses Tauri daemon commands for desktop JSON app API requests", async () => {
    isTauriMock.mockReturnValue(true);
    invokeMock.mockResolvedValueOnce([]);

    await listPendingIngress("token-1");

    expect(fetch).not.toHaveBeenCalled();
    expect(invokeMock).toHaveBeenCalledWith("daemon_request", {
      basePath: "/app/v1",
      path: "/ingress/pending",
      method: "GET",
      body: null,
      sessionToken: "token-1"
    });
  });

  it("uses Tauri daemon commands when IPC internals are available", async () => {
    isTauriMock.mockReturnValue(false);
    vi.stubGlobal("window", { __TAURI_INTERNALS__: { invoke: vi.fn() } });
    invokeMock.mockResolvedValueOnce({ identity_address: "alice.jolt" });

    await getStatus();

    expect(fetch).not.toHaveBeenCalled();
    expect(invokeMock).toHaveBeenCalledWith("daemon_request", {
      basePath: "/api/v1",
      path: "/status",
      method: "GET",
      body: null,
      sessionToken: null
    });
  });

  it("uses a Tauri daemon command for desktop JSON publishing", async () => {
    isTauriMock.mockReturnValue(true);
    invokeMock.mockResolvedValueOnce({ content_id: "cid_profile", size: 10 });

    await publishJson("token-1", "/spoke/profile", {
      schema: "spoke.profile.v1",
      displayName: "Alice"
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(invokeMock).toHaveBeenCalledWith("daemon_publish_json", {
      sessionToken: "token-1",
      path: "/spoke/profile",
      jsonText: JSON.stringify(
        {
          schema: "spoke.profile.v1",
          displayName: "Alice"
        },
        null,
        2
      )
    });
  });

  it("uses a Tauri daemon command for desktop binary publishing", async () => {
    isTauriMock.mockReturnValue(true);
    invokeMock.mockResolvedValueOnce({ content_id: "cid_media", size: 3 });

    await publishBinary("token-1", "/spoke/media/media_1", new Blob([new Uint8Array([1, 2, 3])]), {
      fileName: "photo.png",
      mimeType: "image/png"
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(invokeMock).toHaveBeenCalledWith("daemon_publish_bytes", {
      sessionToken: "token-1",
      path: "/spoke/media/media_1",
      bytes: [1, 2, 3],
      fileName: "photo.png",
      mimeType: "image/png"
    });
  });

  it("publishes JSON under /spoke through the web publish endpoint", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ content_id: "cid_profile", size: 10 }));

    await publishJson("token-1", "/spoke/profile", {
      schema: "spoke.profile.v1",
      displayName: "Alice"
    });

    expect(fetch).toHaveBeenCalledWith(
      "/jolt-api/publish",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer token-1" },
        body: expect.any(FormData)
      })
    );
  });

  it("publishes binary media under the Spoke namespace", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ content_id: "cid_media", size: 3, address: "alice.jolt/spoke/media/media_1" })
    );

    await publishBinary("token-1", "/spoke/media/media_1", new Blob([new Uint8Array([1, 2, 3])]), {
      fileName: "photo.webp",
      mimeType: "image/webp"
    });

    expect(fetch).toHaveBeenCalledWith(
      "/jolt-api/publish",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer token-1" },
        body: expect.any(FormData)
      })
    );
  });

  it("does not publish outside the Spoke namespace", async () => {
    expect(() => publishJson("token-1", "/profile", { nope: true })).toThrow(
      "Spoke can only publish under /spoke/"
    );
    await expect(
      publishBinary("token-1", "/media/media_1", new Blob(["nope"]), {
        fileName: "nope.png",
        mimeType: "image/png"
      })
    ).rejects.toThrow("Spoke can only publish under /spoke/");

    expect(fetch).not.toHaveBeenCalled();
  });

  it("decrypts encrypted outgoing objects through the app API", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        content_id: "cid_reply",
        path: "/spoke/outgoing/reply_1",
        plaintext: [123, 125],
        size: 2,
        content_type: "application/json"
      })
    );

    await decryptEncryptedTarget("token-1", "bob.jolt/spoke/outgoing/reply_1");

    expect(fetch).toHaveBeenCalledWith(
      "/jolt-api/encrypted/decrypt",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer token-1",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ target: "bob.jolt/spoke/outgoing/reply_1" })
      })
    );
  });

  it("sends an encrypted object to a recipient through ingress without exposing receiver URLs", async () => {
    const object = { schema: "spoke.reply.v2", id: "obj_1", sender: "alice.jolt" };
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-06T10:00:00.000Z"));
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ content_id: "cid_obj", size: 400, recipient_count: 1 }))
      .mockResolvedValueOnce(jsonResponse({ data: [1, 2, 3], content_id: "cid_obj", size: 3 }))
      .mockResolvedValueOnce(jsonResponse({ ingress_id: "ing_1", status: "pending" } satisfies Partial<IngressRecord>));

    await sendObjectByIdentity("token-1", "bob.jolt", "/spoke/outgoing/obj_1", object);

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/jolt-api/encrypted/publish",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer token-1",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          path: "/spoke/outgoing/obj_1",
          plaintext: Array.from(new TextEncoder().encode(JSON.stringify(object))),
          content_type: "application/json",
          recipients: ["bob.jolt"]
        })
      })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/jolt-api/fetch",
      expect.objectContaining({ body: JSON.stringify({ target: "cid_obj" }) })
    );
    // The app only learns the recipient identity, never the receiver's URL.
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[2][1]?.body))).toEqual({
      recipient: "bob.jolt",
      encrypted_object: [1, 2, 3],
      expires_at: Math.floor(new Date("2026-06-13T10:00:00.000Z").getTime() / 1000)
    });
  });

  it("publishes encrypted image bytes for message attachments", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        content_id: "cid_image",
        size: 3,
        path: "/spoke/messages/media/msg_1/media_1",
        recipient_count: 2
      })
    );

    await publishEncryptedBinary(
      "token-1",
      "/spoke/messages/media/msg_1/media_1",
      new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
      { mimeType: "image/png", recipients: ["bob.jolt", "alice.jolt"] }
    );

    expect(fetch).toHaveBeenCalledWith(
      "/jolt-api/encrypted/publish",
      expect.objectContaining({
        body: JSON.stringify({
          path: "/spoke/messages/media/msg_1/media_1",
          plaintext: [1, 2, 3],
          content_type: "image/png",
          recipients: ["bob.jolt", "alice.jolt"]
        })
      })
    );
  });

  it("reviews and decides local ingress with app capabilities", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse([{ ingress_id: "ing_1", status: "pending" }]))
      .mockResolvedValueOnce(jsonResponse({ plaintext: [123, 125], size: 2, content_type: "application/json" }))
      .mockResolvedValueOnce(jsonResponse({ ingress_id: "ing_1", status: "accepted" }))
      .mockResolvedValueOnce(jsonResponse({ ingress_id: "ing_2", status: "rejected" }));

    await listPendingIngress("token-1");
    await openIngress("token-1", "ing_1");
    await acceptIngress("token-1", "ing_1");
    await rejectIngress("token-1", "ing_2");

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/jolt-api/ingress/pending",
      expect.objectContaining({ headers: { Authorization: "Bearer token-1" } })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/jolt-api/ingress/ing_1/open",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer token-1" }
      })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/jolt-api/ingress/ing_1/accept",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      "/jolt-api/ingress/ing_2/reject",
      expect.objectContaining({ method: "POST" })
    );
  });
});
