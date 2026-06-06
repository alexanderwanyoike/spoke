import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SPOKE_CAPABILITIES,
  acceptIngress,
  decryptEncryptedTarget,
  fetchTarget,
  listPendingIngress,
  makePostPath,
  openIngress,
  publishPostWithIndex,
  publishProfile,
  publishJson,
  rejectIngress,
  requestSpokeSession,
  submitReplyByIdentity,
  type SpokePost,
  type SpokeProfile,
  type SpokeReply
} from "./api";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init
  });
}

describe("Spoke daemon API client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ok: true })));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("requests a Spoke app session with social and ingress capabilities", async () => {
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

  it("publishes profile and posts only under /spoke", async () => {
    const profile: SpokeProfile = {
      schema: "spoke.profile.v1",
      identity: "alice.jolt",
      displayName: "Alice",
      bio: "Local-first notes",
      updatedAt: "2026-06-06T10:00:00.000Z"
    };
    const post: SpokePost = {
      schema: "spoke.post.v1",
      id: "post_1",
      author: "alice.jolt",
      displayName: "Alice",
      title: "Hello",
      body: "First post",
      createdAt: "2026-06-06T10:01:00.000Z",
      path: makePostPath("post_1")
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ content_id: "cid_profile", size: 10 }))
      .mockResolvedValueOnce(jsonResponse({ content_id: "cid_post", size: 10, address: "alice.jolt/spoke/posts/post_1" }))
      .mockResolvedValueOnce(jsonResponse({ content_id: "cid_feed", size: 10, address: "alice.jolt/spoke/feed" }));

    await publishProfile("token-1", profile);
    const result = await publishPostWithIndex("token-1", post, null);

    expect(result.feedIndex.posts).toEqual([
      {
        id: "post_1",
        path: "/spoke/posts/post_1",
        contentId: "cid_post",
        address: "alice.jolt/spoke/posts/post_1",
        title: "Hello",
        createdAt: "2026-06-06T10:01:00.000Z"
      }
    ]);
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/jolt-api/publish",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer token-1" },
        body: expect.any(FormData)
      })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/jolt-api/publish",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData)
      })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/jolt-api/publish",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData)
      })
    );
  });

  it("does not publish outside the Spoke namespace", () => {
    expect(() => publishJson("token-1", "/profile", { nope: true })).toThrow(
      "Spoke can only publish under /spoke/"
    );

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

  it("sends encrypted replies by recipient identity without exposing receiver URLs to the app", async () => {
    const reply: SpokeReply = {
      schema: "spoke.reply.v1",
      id: "reply_1",
      sender: "alice.jolt",
      postAuthor: "bob.jolt",
      postAddress: "bob.jolt/spoke/posts/post_1",
      body: "Nice post",
      createdAt: "2026-06-06T10:02:00.000Z"
    };
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-06T10:00:00.000Z"));
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ content_id: "cid_reply", size: 400, recipient_count: 1 }))
      .mockResolvedValueOnce(jsonResponse({ data: [1, 2, 3], content_id: "cid_reply", size: 3 }))
      .mockResolvedValueOnce(jsonResponse({ ingress_id: "ing_1", status: "pending" }));

    await submitReplyByIdentity("token-1", "bob.jolt", reply);

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
          path: "/spoke/outgoing/reply_1",
          plaintext: Array.from(new TextEncoder().encode(JSON.stringify(reply))),
          content_type: "application/json",
          recipients: ["bob.jolt"]
        })
      })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/jolt-api/fetch",
      expect.objectContaining({
        body: JSON.stringify({ target: "cid_reply" })
      })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/jolt-api/ingress/send",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer token-1",
          "Content-Type": "application/json"
        }
      })
    );
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[2][1]?.body))).toEqual({
      recipient: "bob.jolt",
      encrypted_object: [1, 2, 3],
      expires_at: Math.floor(new Date("2026-06-13T10:00:00.000Z").getTime() / 1000)
    });
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
