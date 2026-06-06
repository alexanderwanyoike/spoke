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

export type SpokeProfile = {
  schema: "spoke.profile.v1";
  identity: string;
  displayName: string;
  bio: string;
  updatedAt: string;
};

export type SpokePost = {
  schema: "spoke.post.v1";
  id: string;
  author: string;
  displayName?: string;
  title: string;
  body: string;
  createdAt: string;
  path: string;
};

export type SpokeFeedIndex = {
  schema: "spoke.feed.v1";
  owner: string;
  updatedAt: string;
  posts: Array<{
    id: string;
    path: string;
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

export const SPOKE_CAPABILITIES = [
  "resolve:public",
  "fetch:public",
  "publish:/spoke/*",
  "publish:encrypted:/spoke/*",
  "inventory:/spoke/*",
  "pin:own:/spoke/*",
  "encrypt:/spoke/*",
  "decrypt:/spoke/*",
  "ingress:read",
  "ingress:decide"
] as const;

const SPOKE_APP_ID = "spoke.local";
const SPOKE_APP_NAME = "Spoke";
const SPOKE_APP_ORIGIN = "http://127.0.0.1:5178";
const SPOKE_PATH_PREFIX = "/spoke/";

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

async function request<T>(basePath: "/jolt-api" | "/jolt-daemon", path: string, init?: RequestInit): Promise<T> {
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

  const form = new FormData();
  const file = new Blob([JSON.stringify(body, null, 2)], { type: "application/json" });
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
  assertSpokePath(path);

  return request<EncryptedPublishResponse>(
    "/jolt-api",
    "/encrypted/publish",
    jsonInit(sessionToken, {
      path,
      plaintext: Array.from(new TextEncoder().encode(JSON.stringify(body))),
      content_type: "application/json",
      recipients: recipients.map((recipient) => recipient.trim()).filter(Boolean)
    })
  );
}

export function resolveAddress(sessionToken: string, address: string) {
  return request<ResolveResponse>("/jolt-api", "/resolve", jsonInit(sessionToken, { address }));
}

export function fetchTarget(sessionToken: string, target: string) {
  return request<FetchResult>("/jolt-api", "/fetch", jsonInit(sessionToken, { target }));
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

export async function submitReplyThroughIngress(
  sessionToken: string,
  receiverUrl: string,
  receiverIdentity: string,
  reply: SpokeReply
) {
  const outgoingPath = `/spoke/outgoing/${reply.id}`;
  const encrypted = await publishEncryptedJson(sessionToken, outgoingPath, reply, [receiverIdentity]);
  const encryptedBytes = await fetchTarget(sessionToken, encrypted.content_id);
  const endpoint = `${receiverUrl.replace(/\/$/, "")}/api/v1/ingress`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      receiver_id: "direct-local",
      encrypted_object: encryptedBytes.data,
      expires_at: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
    })
  });

  return parseResponse<IngressRecord>(response);
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

export function makeId(prefix: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2);
  return `${prefix}_${random.slice(0, 16)}`;
}
