// Jolt SDK / ACL seam.
//
// Since v0.1.6 the wire layer is jolt-sdk (extracted from this very module;
// see jolt's sdks/js). This barrel binds the SDK to Spoke's runtime (Tauri
// invoke on desktop, the vite proxy on web) and preserves the import surface
// the app has always used, so feature code and fakes are unchanged. Consumers
// import everything through "./jolt", never the SDK transports directly.
// See docs/CONTEXT.md ("Jolt SDK / ACL").

import {
  apiErrorMessage as sdkApiErrorMessage,
  createDataClient,
  createJoltClient,
  makeId,
  operations as ops,
  referenceKey,
  referenceTarget,
  type FetchResult,
  type AppCompatibilityDeclaration,
  type CompatibilityCheckOptions,
  type JoltAppendSdk,
  type JoltEncryptedSdk,
  type JoltIngressSdk,
  type JoltSdk,
  type JoltTransport,
  type SessionRequest
} from "jolt-sdk";
import { HttpTransport } from "jolt-sdk/transport-http";
import { isTauriRuntime, TauriTransport } from "jolt-sdk/transport-tauri";
import appCompatibility from "../../spoke-compatibility.json";
import { isJoltUnavailableError, JOLT_UNAVAILABLE_MESSAGE } from "./errors";

export { makeId, referenceKey, referenceTarget };
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
  Versioned
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
  ResolveResponse
} from "jolt-sdk";

// One transport for the whole app, chosen by runtime. Desktop goes through
// the shared Jolt Tauri plugin; web goes through the vite proxy so the
// browser never needs CORS access to the daemon.
function makeTransport(): JoltTransport {
  return isTauriRuntime() ? new TauriTransport({ plugin: true }) : HttpTransport.viteProxy();
}

let transport: JoltTransport | null = null;
function getTransport(): JoltTransport {
  transport ??= makeTransport();
  return transport;
}

function getClient(getSessionToken: () => string = () => "") {
  return createJoltClient({ transport: getTransport(), getSessionToken });
}

/** Advanced host seam consumed only by Spoke's typed Data application. */
export function createJoltDataClient(getSessionToken: () => string) {
  return createDataClient({ transport: getTransport(), getSessionToken });
}

function assertSpokePath(path: string) {
  if (!path.startsWith("/spoke/")) {
    throw new Error("Spoke can only write under /spoke/");
  }
}

export const SPOKE_COMPATIBILITY = {
  appApi: appCompatibility.app_api,
  requiredFeatures: appCompatibility.required_features,
  optionalFeatures: appCompatibility.optional_features
} as const satisfies AppCompatibilityDeclaration;

export function checkSpokeCompatibility(
  declaration: AppCompatibilityDeclaration = SPOKE_COMPATIBILITY,
  options?: CompatibilityCheckOptions
) {
  return getClient().checkCompatibility(declaration, options);
}

export function apiErrorMessage(error: unknown) {
  return isJoltUnavailableError(error) ? JOLT_UNAVAILABLE_MESSAGE : sdkApiErrorMessage(error);
}

/** The fakeable adapter Spoke's commands and queries depend on. */
export function createJoltSdk(
  getSessionToken: () => string
): JoltSdk & JoltEncryptedSdk & JoltIngressSdk & JoltAppendSdk {
  const client = getClient(getSessionToken);
  return {
    ...client,
    async publishJson(path, body, options) {
      assertSpokePath(path);
      return await client.publishJson(path, body, options);
    },
    async publishAppend(path, body, options) {
      assertSpokePath(path);
      return await client.publishAppend(path, body, options);
    },
    async publishEncryptedJson(path, body, recipients, options) {
      assertSpokePath(path);
      return await client.publishEncryptedJson(path, body, recipients, options);
    },
    async sendObject(recipient, path, body, options) {
      assertSpokePath(path);
      return await client.sendObject(recipient, path, body, options);
    }
  };
}

// App-shell daemon operations (bootstrap, session, media) that sit outside
// the social command/query surface, with their historical token-first
// signatures preserved.

export function getStatus() {
  return getClient().getStatus();
}

export function requestSession(req: SessionRequest) {
  return getClient().requestSession(req);
}

export function getSessionRequestStatus(requestId: string) {
  return getClient().getSessionRequestStatus(requestId);
}

export function getCurrentSession(sessionToken: string) {
  return getClient(() => sessionToken).getCurrentSession();
}

export function listPublished(sessionToken: string) {
  return getClient(() => sessionToken).listPublished();
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
  assertSpokePath(path);
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
  assertSpokePath(path);
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
