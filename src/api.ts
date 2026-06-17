import { invoke, isTauri } from "@tauri-apps/api/core";
import type { SpokeFollowRequest, SpokeFollowResponse } from "./follow";
import type { SpokeAttachment } from "./media";
import type { SpokeMessage } from "./message";

export type NodeStatus = {
  peer_id: string;
  identity_address: string;
  uptime_secs: number;
  connected_peers: number;
};

export type PublishResponse = {
  content_id: string;
  size: number;
  path?: string | null;
  address?: string | null;
  latest_sequence?: number | null;
};

export type EncryptedPublishResponse = PublishResponse & {
  recipient_count: number;
};

export type PublishedContent = {
  content_id: string;
  size: number;
  path?: string | null;
  address?: string | null;
  local_sequence?: number | null;
  pin_state: string;
};

export type ResolveResponse = {
  address: string;
  identity: string;
  path: string;
  latest_sequence: number;
  content_id: string;
  reachability_hints: unknown[];
  source: string;
};

export type FetchResult = {
  data: number[];
  content_id: string;
  size: number;
};

export type AppSessionStatus = "pending" | "active" | "rejected" | "revoked" | "expired";

export type AppSessionRequestResponse = {
  request_id: string;
  status: AppSessionStatus;
};

export type AppSessionStatusResponse = {
  request_id: string;
  session_id?: string | null;
  session_token?: string | null;
  status: AppSessionStatus;
  identity?: string | null;
  capabilities: string[];
  expires_at?: number | null;
};

export type CurrentAppSession = {
  request_id: string;
  session_id?: string | null;
  app_id: string;
  app_name: string;
  identity?: string | null;
  granted_capabilities: string[];
  status: AppSessionStatus;
  expires_at?: number | null;
  last_used_at?: number | null;
};

export type IngressRecord = {
  ingress_id: string;
  receiver_id: string;
  sender_identity: string;
  recipient_identity: string;
  schema_hint?: string | null;
  status: "pending" | "accepted" | "rejected";
  received_at: number;
  expires_at?: number | null;
  size: number;
  accepted_at?: number | null;
  rejected_at?: number | null;
};

export type DecryptedIngress = {
  plaintext: number[];
  size: number;
  content_type: string;
};

export type DecryptedEncryptedObject = {
  content_id: string;
  path: string;
  plaintext: number[];
  size: number;
  content_type: string;
};

export type SpokeProfileLink = {
  label: string;
  url: string;
};

export type SpokeProfile = {
  schema: "spoke.profile.v1" | "spoke.profile.v2";
  identity: string;
  displayName: string;
  bio: string;
  avatar?: SpokeAttachment;
  links?: SpokeProfileLink[];
  location?: string;
  pronouns?: string;
  updatedAt: string;
};

export type SpokePost = {
  schema: "spoke.post.v1" | "spoke.post.v2";
  id: string;
  author: string;
  displayName?: string;
  title: string;
  body: string;
  createdAt: string;
  path: string;
  threadPath?: string;
  attachments?: SpokeAttachment[];
};

export type SpokeFeedIndex = {
  schema: "spoke.feed.v1";
  owner: string;
  updatedAt: string;
  posts: Array<{
    id: string;
    path: string;
    contentId?: string;
    address?: string | null;
    title: string;
    createdAt: string;
  }>;
};

export type SpokeReply = {
  schema: "spoke.reply.v1";
  id: string;
  sender: string;
  postAuthor: string;
  postAddress: string;
  body: string;
  createdAt: string;
};

export type SpokeThreadReply = {
  schema: "spoke.reply.v2";
  id: string;
  postId: string;
  postAuthor: string;
  parent: string;
  author: string;
  body: string;
  createdAt: string;
  address?: string | null;
  contentId?: string;
};

export type SpokeAnyReply = SpokeReply | SpokeThreadReply;

export type SpokeThreadManifestReply = {
  id: string;
  author: string;
  address?: string | null;
  contentId?: string;
  createdAt: string;
  moderation: "accepted";
};

export type SpokeThreadManifest = {
  schema: "spoke.thread.v2";
  postId: string;
  owner: string;
  participants: Array<{
    identity: string;
    addedAt: string;
  }>;
  replies: SpokeThreadManifestReply[];
  updatedAt: string;
};

export type SpokeThreadIndex = {
  schema: "spoke.thread.v1";
  id: string;
  owner: string;
  postAddress: string;
  visibility: "public";
  updatedAt: string;
  replies: Array<{
    id: string;
    sender: string;
    address?: string | null;
    contentId?: string;
    createdAt: string;
    moderation: "accepted";
  }>;
};

export const SPOKE_CAPABILITIES = [
  "resolve:public",
  "fetch:public",
  "publish:/spoke/*",
  "publish:encrypted:/spoke/*",
  "inventory:/spoke/*",
  "pin:own:/spoke/*",
  "encrypt:/spoke/*",
  "decrypt:/spoke/*",
  "ingress:send",
  "ingress:read",
  "ingress:decide"
] as const;

const SPOKE_APP_ID = "spoke.local";
const SPOKE_APP_NAME = "Spoke";
const SPOKE_APP_ORIGIN = "http://127.0.0.1:5178";
const SPOKE_PATH_PREFIX = "/spoke/";
const APP_API_BASE = "/app/v1";
const DAEMON_API_BASE = "/api/v1";
const WEB_APP_PROXY_BASE = "/jolt-api";
const WEB_DAEMON_PROXY_BASE = "/jolt-daemon";

type WebProxyBasePath = typeof WEB_APP_PROXY_BASE | typeof WEB_DAEMON_PROXY_BASE;

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof body === "object" && body && "error" in body
        ? String((body as { error: unknown }).error)
        : typeof body === "string" && body.trim()
          ? body
          : `HTTP ${response.status}`;
    throw new Error(message);
  }

  return body as T;
}

function isDesktopRuntime() {
  const internals =
    typeof window === "undefined"
      ? null
      : (window as typeof window & {
          __TAURI_INTERNALS__?: { invoke?: unknown };
        }).__TAURI_INTERNALS__;
  return isTauri() || typeof internals?.invoke === "function";
}

function authorizationToken(init?: RequestInit) {
  const headers = init?.headers;
  if (!headers || headers instanceof Headers || Array.isArray(headers)) {
    return null;
  }

  const authorization = headers.Authorization || headers.authorization;
  return authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;
}

function jsonBody(init?: RequestInit) {
  return typeof init?.body === "string" ? JSON.parse(init.body) : null;
}

function desktopBasePath(webBasePath: WebProxyBasePath) {
  return webBasePath === WEB_DAEMON_PROXY_BASE ? DAEMON_API_BASE : APP_API_BASE;
}

async function desktopRequest<T>(
  basePath: WebProxyBasePath,
  path: string,
  init?: RequestInit
): Promise<T> {
  return invoke<T>("daemon_request", {
    basePath: desktopBasePath(basePath),
    path,
    method: init?.method || "GET",
    body: jsonBody(init),
    sessionToken: authorizationToken(init)
  });
}

async function request<T>(basePath: WebProxyBasePath, path: string, init?: RequestInit): Promise<T> {
  if (isDesktopRuntime()) {
    return desktopRequest<T>(basePath, path, init);
  }

  const response = await fetch(`${basePath}${path}`, init);
  return parseResponse<T>(response);
}

function bearerInit(sessionToken: string, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${sessionToken}`
    }
  };
}

function jsonInit(sessionToken: string | null, body: unknown): RequestInit {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }

  return {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  };
}

function assertSpokePath(path: string) {
  if (!path.startsWith(SPOKE_PATH_PREFIX)) {
    throw new Error("Spoke can only publish under /spoke/");
  }
}

export function apiErrorMessage(error: unknown) {
  if (error instanceof TypeError) {
    return "Cannot reach the Spoke dev proxy or Jolt daemon.";
  }

  if (error instanceof Error) {
    if (error.message === "HTTP 500" || error.message === "HTTP 502") {
      return "Cannot reach the Jolt daemon. Start it on the configured API port and refresh.";
    }
    return error.message;
  }

  return String(error);
}

export function getStatus() {
  return request<NodeStatus>("/jolt-daemon", "/status");
}

export function requestSpokeSession(identity: string) {
  const appOrigin =
    typeof window === "undefined" ? SPOKE_APP_ORIGIN : window.location.origin;

  return request<AppSessionRequestResponse>(
    "/jolt-api",
    "/sessions/request",
    jsonInit(null, {
      app_id: SPOKE_APP_ID,
      app_name: SPOKE_APP_NAME,
      app_origin: appOrigin,
      requested_identity: identity,
      requested_capabilities: SPOKE_CAPABILITIES
    })
  );
}

export function getSessionRequestStatus(requestId: string) {
  return request<AppSessionStatusResponse>("/jolt-api", `/sessions/${requestId}`);
}

export function getCurrentSession(sessionToken: string) {
  return request<CurrentAppSession>("/jolt-api", "/session", bearerInit(sessionToken));
}

export function listPublished(sessionToken: string) {
  return request<PublishedContent[]>("/jolt-api", "/published", bearerInit(sessionToken));
}

export function publishJson<T extends object>(sessionToken: string, path: string, body: T) {
  assertSpokePath(path);

  const jsonText = JSON.stringify(body, null, 2);

  if (isDesktopRuntime()) {
    return invoke<PublishResponse>("daemon_publish_json", {
      sessionToken,
      path,
      jsonText
    });
  }

  const form = new FormData();
  const file = new Blob([jsonText], { type: "application/json" });
  form.append("file", file, `${path.split("/").pop() || "spoke"}.json`);
  form.append("path", path);

  return request<PublishResponse>(
    "/jolt-api",
    "/publish",
    bearerInit(sessionToken, {
      method: "POST",
      body: form
    })
  );
}

export async function publishBinary(
  sessionToken: string,
  path: string,
  file: File | Blob,
  options: { fileName: string; mimeType: string }
) {
  assertSpokePath(path);

  if (isDesktopRuntime()) {
    return invoke<PublishResponse>("daemon_publish_bytes", {
      sessionToken,
      path,
      bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
      fileName: options.fileName,
      mimeType: options.mimeType
    });
  }

  const form = new FormData();
  form.append("file", file, options.fileName);
  form.append("path", path);

  return request<PublishResponse>(
    "/jolt-api",
    "/publish",
    bearerInit(sessionToken, {
      method: "POST",
      body: form
    })
  );
}

export function publishProfile(sessionToken: string, profile: SpokeProfile) {
  return publishJson(sessionToken, "/spoke/profile", profile);
}

export async function publishPostWithIndex(
  sessionToken: string,
  post: SpokePost,
  existingIndex: SpokeFeedIndex | null
) {
  assertSpokePath(post.path);
  const publishedPost = await publishJson(sessionToken, post.path, post);
  const nextIndex: SpokeFeedIndex = {
    schema: "spoke.feed.v1",
    owner: post.author,
    updatedAt: new Date().toISOString(),
    posts: [
      {
        id: post.id,
        path: post.path,
        contentId: publishedPost.content_id,
        address: publishedPost.address,
        title: post.title,
        createdAt: post.createdAt
      },
      ...(existingIndex?.posts || []).filter((item) => item.id !== post.id)
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  };
  const publishedIndex = await publishJson(sessionToken, "/spoke/feed", nextIndex);
  return { post: publishedPost, index: publishedIndex, feedIndex: nextIndex };
}

export function publishEncryptedJson(
  sessionToken: string,
  path: string,
  body: object,
  recipients: string[]
) {
  return publishEncryptedBytes(
    sessionToken,
    path,
    Array.from(new TextEncoder().encode(JSON.stringify(body))),
    "application/json",
    recipients
  );
}

export function publishEncryptedBytes(
  sessionToken: string,
  path: string,
  plaintext: number[],
  contentType: string,
  recipients: string[]
) {
  assertSpokePath(path);

  return request<EncryptedPublishResponse>(
    "/jolt-api",
    "/encrypted/publish",
    jsonInit(sessionToken, {
      path,
      plaintext,
      content_type: contentType,
      recipients: recipients.map((recipient) => recipient.trim()).filter(Boolean)
    })
  );
}

export async function publishEncryptedBinary(
  sessionToken: string,
  path: string,
  file: File | Blob,
  options: { mimeType: string; recipients: string[] }
) {
  return publishEncryptedBytes(
    sessionToken,
    path,
    Array.from(new Uint8Array(await file.arrayBuffer())),
    options.mimeType,
    options.recipients
  );
}

export function resolveAddress(sessionToken: string, address: string) {
  return request<ResolveResponse>("/jolt-api", "/resolve", jsonInit(sessionToken, { address }));
}

export function fetchTarget(sessionToken: string, target: string) {
  return request<FetchResult>("/jolt-api", "/fetch", jsonInit(sessionToken, { target }));
}

export function decryptEncryptedTarget(sessionToken: string, target: string) {
  return request<DecryptedEncryptedObject>(
    "/jolt-api",
    "/encrypted/decrypt",
    jsonInit(sessionToken, { target })
  );
}

export function listPendingIngress(sessionToken: string) {
  return request<IngressRecord[]>("/jolt-api", "/ingress/pending", bearerInit(sessionToken));
}

export function openIngress(sessionToken: string, ingressId: string) {
  return request<DecryptedIngress>(
    "/jolt-api",
    `/ingress/${encodeURIComponent(ingressId)}/open`,
    bearerInit(sessionToken, { method: "POST" })
  );
}

export function acceptIngress(sessionToken: string, ingressId: string) {
  return request<IngressRecord>(
    "/jolt-api",
    `/ingress/${encodeURIComponent(ingressId)}/accept`,
    bearerInit(sessionToken, { method: "POST" })
  );
}

export function rejectIngress(sessionToken: string, ingressId: string) {
  return request<IngressRecord>(
    "/jolt-api",
    `/ingress/${encodeURIComponent(ingressId)}/reject`,
    bearerInit(sessionToken, { method: "POST" })
  );
}

export async function submitReplyByIdentity(
  sessionToken: string,
  receiverIdentity: string,
  reply: SpokeAnyReply
) {
  return submitSpokeObjectByIdentity(sessionToken, receiverIdentity, reply.id, reply);
}

export function submitFollowRequestByIdentity(
  sessionToken: string,
  receiverIdentity: string,
  request: SpokeFollowRequest
) {
  return submitSpokeObjectByIdentity(sessionToken, receiverIdentity, request.id, request);
}

export function submitFollowResponseByIdentity(
  sessionToken: string,
  receiverIdentity: string,
  response: SpokeFollowResponse
) {
  return submitSpokeObjectByIdentity(sessionToken, receiverIdentity, response.id, response);
}

export function submitMessageByIdentity(
  sessionToken: string,
  receiverIdentity: string,
  message: SpokeMessage
) {
  return submitSpokeObjectByIdentity(
    sessionToken,
    receiverIdentity,
    message.id,
    message,
    `/spoke/messages/outgoing/${message.id}`
  );
}

async function submitSpokeObjectByIdentity(
  sessionToken: string,
  receiverIdentity: string,
  objectId: string,
  body: object,
  path?: string
) {
  const outgoingPath = path || `/spoke/outgoing/${objectId}`;
  const encrypted = await publishEncryptedJson(sessionToken, outgoingPath, body, [receiverIdentity]);
  const encryptedBytes = await fetchTarget(sessionToken, encrypted.content_id);

  return request<IngressRecord>(
    "/jolt-api",
    "/ingress/send",
    jsonInit(sessionToken, {
      recipient: receiverIdentity,
      encrypted_object: encryptedBytes.data,
      expires_at: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
    })
  );
}

export function decodeFetchData(result: FetchResult) {
  return new TextDecoder().decode(new Uint8Array(result.data));
}

export function decodePlaintext(result: DecryptedIngress) {
  return new TextDecoder().decode(new Uint8Array(result.plaintext));
}

export function parseJsonBytes<T>(bytes: number[]) {
  return JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))) as T;
}

export function makePostPath(id: string) {
  return `/spoke/posts/${id}`;
}

export function makeReplyPath(id: string) {
  return `/spoke/replies/${id}`;
}

export function makeThreadPath(postId: string) {
  return `/spoke/threads/${postId}`;
}

export function makeId(prefix: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2);
  return `${prefix}_${random.slice(0, 16)}`;
}
