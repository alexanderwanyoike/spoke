// The inbox seam: the recipient-controlled ingress door.
//
// Jolt delivers follow requests/responses, replies, and messages to the local
// identity as encrypted ingress records. This seam owns the open/accept/reject
// loop and dispatches each decoded payload to a per-feature InboxHandler. It is
// thin: all social effects live in the feature commands the handlers call
// (src/follow, src/message, src/thread). App only kicks processInbox and renders
// the records left for manual review.

import type { IngressRecord } from "../api";
import type { JoltEncryptedSdk, JoltIngressSdk, JoltSdk } from "../jolt";
import type { Store } from "../common/store";

export type InboxSdk = JoltSdk & JoltEncryptedSdk & JoltIngressSdk;

// "auto": apply now without asking the user. "manual": leave it in the review
// queue. Auto-classification is conservative; anything uncertain is manual.
export type InboxDecision = "auto" | "manual";

export type InboxContext = {
  localIdentity: string;
  // The store the handlers' commands fold into. Omitted in production (commands
  // default to the domain-wide store); supplied in tests for isolation.
  store?: Store;
};

export interface InboxHandler {
  // Does this handler understand the decoded payload?
  match(payload: unknown): boolean;
  // On first sight, should the loop auto-apply or leave for manual review?
  classify(payload: unknown, ctx: InboxContext): InboxDecision;
  // Apply acceptance (the auto path and the manual "Accept" both call this).
  accept(sdk: InboxSdk, payload: unknown, ctx: InboxContext): Promise<void>;
  // Optional effect when the user rejects (e.g. send a rejected follow response).
  reject?(sdk: InboxSdk, payload: unknown, ctx: InboxContext): Promise<void>;
}

export type ProcessInboxResult = {
  // Records left for the user to review (could not be auto-classified).
  visible: IngressRecord[];
  // Records the loop accepted automatically this pass.
  autoHandled: IngressRecord[];
};

// Records whose schema_hint we never auto-open: anything outside this set is
// left for manual review without being decrypted (mirrors the prior behavior).
// follow_request.v1 and reply.v2 are intentionally absent - they are reviewed.
const AUTO_OPEN_HINTS = new Set([
  "spoke.follow_response.v1",
  "spoke.reply.v1",
  "spoke.message.v1",
  "spoke.message.v2"
]);

function isAlreadyHandled(err: unknown) {
  return err instanceof Error && err.message.includes("ingress envelope is not pending");
}

// Accept a pending ingress record, tolerating a concurrent poll that already
// accepted it (so a double-process is not an error).
async function acceptTolerant(sdk: JoltIngressSdk, ingressId: string) {
  try {
    await sdk.acceptIngress(ingressId);
  } catch (err) {
    if (!isAlreadyHandled(err)) throw err;
  }
}

function handlerFor(handlers: InboxHandler[], payload: unknown): InboxHandler | undefined {
  return payload == null ? undefined : handlers.find((handler) => handler.match(payload));
}

// One ingress pass: list pending records, auto-apply what the handlers classify
// as "auto", and return the rest for manual review.
export async function processInbox(
  sdk: InboxSdk,
  handlers: InboxHandler[],
  ctx: InboxContext
): Promise<ProcessInboxResult> {
  const records = await sdk.listPendingIngress();
  const visible: IngressRecord[] = [];
  const autoHandled: IngressRecord[] = [];

  for (const record of records) {
    if (record.schema_hint && !AUTO_OPEN_HINTS.has(record.schema_hint)) {
      visible.push(record);
      continue;
    }
    let payload: unknown = null;
    try {
      payload = await sdk.openIngress(record.ingress_id);
    } catch {
      payload = null;
    }
    const handler = handlerFor(handlers, payload);
    if (!handler || handler.classify(payload, ctx) !== "auto") {
      visible.push(record);
      continue;
    }
    try {
      await acceptTolerant(sdk, record.ingress_id);
      await handler.accept(sdk, payload, ctx);
      autoHandled.push(record);
    } catch {
      // Anything that fails to auto-apply falls back to manual review.
      visible.push(record);
    }
  }

  return { visible, autoHandled };
}

// The manual "Accept" action for a reviewed record.
export async function acceptInboxRecord(
  sdk: InboxSdk,
  handlers: InboxHandler[],
  ingressId: string,
  payload: unknown,
  ctx: InboxContext
): Promise<void> {
  await acceptTolerant(sdk, ingressId);
  await handlerFor(handlers, payload)?.accept(sdk, payload, ctx);
}

// The manual "Reject" action: reject the envelope and run any handler-specific
// side effect (e.g. notify the requester their follow was declined).
export async function rejectInboxRecord(
  sdk: InboxSdk,
  handlers: InboxHandler[],
  ingressId: string,
  payload: unknown,
  ctx: InboxContext
): Promise<void> {
  await sdk.rejectIngress(ingressId);
  await handlerFor(handlers, payload)?.reject?.(sdk, payload, ctx);
}

export { createInboxHandlers } from "./handlers";
