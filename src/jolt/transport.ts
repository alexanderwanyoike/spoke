// Jolt transport (the wire layer of the ACL).
//
// This is the only module that talks to the Jolt daemon - over Tauri `invoke`
// on desktop or `fetch` against the dev proxy on web. It owns the request core,
// the wire DTOs, and the daemon operations (publish/resolve/fetch/encrypt/
// ingress/session). It is app-agnostic: no Spoke domain types, namespaces, or
// capabilities live here - those belong to the feature models and src/session.ts.
// Consumers import everything through the "./jolt" barrel, never this file
// directly. See docs/cards/105-spoke-complete-jolt-sdk-seam.md.

import { invoke, isTauri } from "@tauri-apps/api/core";

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

export function apiErrorMessage(error: unknown) {
  if (error instanceof TypeError) {
    return "Cannot reach the dev proxy or Jolt daemon.";
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

// What an app needs to declare to open a Jolt session. The app's identity,
// name, origin, and requested capabilities are the caller's concern, not the
// transport's - Spoke supplies them in src/session.ts.
export type SessionRequest = {
  appId: string;
  appName: string;
  appOrigin: string;
  identity: string;
  capabilities: readonly string[];
};

export function requestSession(req: SessionRequest) {
  return request<AppSessionRequestResponse>(
    "/jolt-api",
    "/sessions/request",
    jsonInit(null, {
      app_id: req.appId,
      app_name: req.appName,
      app_origin: req.appOrigin,
      requested_identity: req.identity,
      requested_capabilities: req.capabilities
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
  form.append("file", file, `${path.split("/").pop() || "object"}.json`);
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

// One device-writer append record as the daemon's enumeration returns it (J1).
export type AppendRecordInfo = {
  path: string;
  content_id: string;
  device_id: string;
  device_sequence: number;
  created_at: string;
  entry_hash: string;
};

// J1 append publish: write a coexisting device-writer append entry at `path`
// (never the last-writer-wins update log), so concurrent records survive. JSON
// body sent as the multipart file, mirroring publishJson.
export async function appendPublishJson<T extends object>(
  sessionToken: string,
  path: string,
  body: T
) {
  const jsonText = JSON.stringify(body, null, 2);
  const fileName = `${path.split("/").pop() || "object"}.json`;

  if (isDesktopRuntime()) {
    return invoke<PublishResponse>("daemon_append", {
      sessionToken,
      path,
      bytes: Array.from(new TextEncoder().encode(jsonText)),
      fileName,
      mimeType: "application/json"
    });
  }

  const form = new FormData();
  form.append("file", new Blob([jsonText], { type: "application/json" }), fileName);
  form.append("path", path);

  return request<PublishResponse>(
    "/jolt-api",
    "/append",
    bearerInit(sessionToken, { method: "POST", body: form })
  );
}

// J1 enumeration: list a (remote or local) identity's append records under a
// path prefix. Capability resolve:public; works for any identity now that J2
// syncs remote device-writer state.
export function enumerate(sessionToken: string, identity: string, pathPrefix: string) {
  return request<AppendRecordInfo[]>(
    "/jolt-api",
    "/enumerate",
    jsonInit(sessionToken, { identity, path_prefix: pathPrefix })
  );
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

// Encrypt-publish an object at `outgoingPath` (the sender's own copy) and
// ingress-send the encrypted bytes to the recipient. Returns both the encrypted
// publish result (so the sender can fold its own copy into the store with a
// version) and the resulting ingress record. The receiver's URL is never
// exposed to the app; it only learns the recipient identity.
export async function sendObjectByIdentity(
  sessionToken: string,
  receiverIdentity: string,
  outgoingPath: string,
  body: object
): Promise<{ encryptedPublish: EncryptedPublishResponse; ingress: IngressRecord }> {
  const encryptedPublish = await publishEncryptedJson(
    sessionToken,
    outgoingPath,
    body,
    [receiverIdentity]
  );
  const encryptedBytes = await fetchTarget(sessionToken, encryptedPublish.content_id);
  const ingress = await request<IngressRecord>(
    "/jolt-api",
    "/ingress/send",
    jsonInit(sessionToken, {
      recipient: receiverIdentity,
      encrypted_object: encryptedBytes.data,
      expires_at: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
    })
  );
  return { encryptedPublish, ingress };
}

export function decodeFetchData(result: FetchResult) {
  return new TextDecoder().decode(new Uint8Array(result.data));
}

export function decodePlaintext(result: DecryptedIngress) {
  return new TextDecoder().decode(new Uint8Array(result.plaintext));
}

export function makeId(prefix: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2);
  return `${prefix}_${random.slice(0, 16)}`;
}
