// Jolt SDK / ACL seam.
//
// Since v0.1.6 the wire layer is jolt-sdk (extracted from this very module;
// see jolt's sdks/js). This barrel binds the SDK to Spoke's runtime (Tauri
// invoke on desktop, the vite proxy on web) and preserves the import surface
// the app has always used, so feature code and fakes are unchanged. Consumers
// import everything through "./jolt", never the SDK transports directly.
// See docs/CONTEXT.md ("Jolt SDK / ACL").

import {
  apiErrorMessage,
  createJoltClient,
  makeId,
  operations as ops,
  referenceKey,
  referenceTarget,
  type FetchResult,
  type JoltAppendSdk,
  type JoltEncryptedSdk,
  type JoltIngressSdk,
  type JoltSdk,
  type JoltTransport,
  type SessionRequest,
} from "jolt-sdk";
import { HttpTransport } from "jolt-sdk/transport-http";
import { isTauriRuntime, TauriTransport } from "jolt-sdk/transport-tauri";

export { apiErrorMessage, makeId, referenceKey, referenceTarget };
export type {
  Decoder,
  EnumeratedRecord,
  JoltAppendSdk,
  JoltEncryptedSdk,
  JoltIngressSdk,
  JoltSdk,
  PublishResult,
  Reference,
  SessionRequest,
  Versioned,
} from "jolt-sdk";
export type {
  AppSessionStatus,
  CurrentAppSession,
  DecryptedIngress,
  EncryptedPublishResponse,
  FetchResult,
  IngressRecord,
  NodeStatus,
  PublishedContent,
  PublishResponse,
  ResolveResponse,
} from "jolt-sdk";

// One transport for the whole app, chosen by runtime. Desktop goes through
// the Tauri commands in src-tauri; web goes through the vite proxy so the
// browser never needs CORS access to the daemon.
function makeTransport(): JoltTransport {
  return isTauriRuntime() ? new TauriTransport() : HttpTransport.viteProxy();
}

let transport: JoltTransport | null = null;
function getTransport(): JoltTransport {
  transport ??= makeTransport();
  return transport;
}

/** The fakeable adapter Spoke's commands and queries depend on. */
export function createJoltSdk(
  getSessionToken: () => string
): JoltSdk & JoltEncryptedSdk & JoltIngressSdk & JoltAppendSdk {
  return createJoltClient({ transport: getTransport(), getSessionToken });
}

// App-shell daemon operations (bootstrap, session, media) that sit outside
// the social command/query surface, with their historical token-first
// signatures preserved.

export function getStatus() {
  return ops.getStatus(getTransport());
}

export function requestSession(req: SessionRequest) {
  return ops.requestSession(getTransport(), req);
}

export function getSessionRequestStatus(requestId: string) {
  return ops.getSessionRequestStatus(getTransport(), requestId);
}

export function getCurrentSession(sessionToken: string) {
  return ops.getCurrentSession(getTransport(), sessionToken);
}

export function listPublished(sessionToken: string) {
  return ops.listPublished(getTransport(), sessionToken);
}

export function fetchTarget(sessionToken: string, target: string) {
  return ops.fetchTarget(getTransport(), sessionToken, target);
}

export function decryptEncryptedTarget(sessionToken: string, target: string) {
  return ops.decryptEncryptedTarget(getTransport(), sessionToken, target);
}

export async function publishBinary(
  sessionToken: string,
  path: string,
  file: File | Blob,
  options: { fileName: string; mimeType: string }
) {
  return ops.publishBytes(
    getTransport(),
    sessionToken,
    path,
    new Uint8Array(await file.arrayBuffer()),
    options
  );
}

export async function publishEncryptedBinary(
  sessionToken: string,
  path: string,
  file: File | Blob,
  options: { mimeType: string; recipients: string[] }
) {
  return ops.publishEncryptedBytes(
    getTransport(),
    sessionToken,
    path,
    new Uint8Array(await file.arrayBuffer()),
    options
  );
}

export function decodeFetchData(result: FetchResult) {
  return new TextDecoder().decode(new Uint8Array(result.data));
}
