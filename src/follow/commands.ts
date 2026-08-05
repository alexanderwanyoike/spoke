// Commands: the write half of the follow/contacts seam. Every contact edge is
// published encrypted to self (ADR 0004) and folded into the monotonic store;
// follow requests/responses are sent to the peer through encrypted ingress.

import { makeId, type JoltEncryptedSdk, type JoltIngressSdk } from "../jolt";
import { store as defaultStore, type Store } from "../common/store";
import {
  makeContactPath,
  normalizeIdentity,
  sameIdentity,
  type ContactRelationship,
  type SpokeContact,
  type SpokeFollowRequest,
  type SpokeFollowResponse
} from "./model";

function foldContact(
  store: Store,
  localIdentity: string,
  record: SpokeContact,
  latestSequence: number
) {
  store.upsert({
    identity: normalizeIdentity(localIdentity),
    path: makeContactPath(record.identity),
    latestSequence,
    contentId: `contact_${normalizeIdentity(record.identity)}`,
    value: record,
    tombstone: record.removed === true
  });
}

function storedContact(
  store: Store,
  localIdentity: string,
  identity: string
): SpokeContact | undefined {
  const entry = store.get({
    identity: normalizeIdentity(localIdentity),
    path: makeContactPath(identity)
  });
  return entry?.value as SpokeContact | undefined;
}

// Low-level edge writer: publish one contact record encrypted to self and fold
// it into the store. Relationship transitions and tombstones are just newer
// records at the same per-edge path. The store sequence is bumped past the
// existing entry so an optimistic local fold is never a no-op downgrade.
export async function publishContact(
  sdk: JoltEncryptedSdk,
  localIdentity: string,
  contact: { identity: string; displayName: string; relationship: ContactRelationship },
  options: { removed?: boolean } = {},
  store: Store = defaultStore
): Promise<SpokeContact> {
  const path = makeContactPath(contact.identity);
  const record: SpokeContact = {
    schema: "spoke.contact.v1",
    identity: contact.identity,
    displayName: contact.displayName || contact.identity,
    relationship: contact.relationship,
    updatedAt: new Date().toISOString(),
    ...(options.removed ? { removed: true } : {})
  };
  const published = await sdk.publishEncryptedJson(path, record, [localIdentity]);
  const existing = store.get({ identity: normalizeIdentity(localIdentity), path });
  const latestSequence = Math.max(published.latestSequence, (existing?.latestSequence ?? -1) + 1);
  foldContact(store, localIdentity, record, latestSequence);
  return record;
}

// Add a local-only contact (no follow request sent): just an address-book entry.
export async function addContact(
  sdk: JoltEncryptedSdk,
  localIdentity: string,
  draft: { identity: string; displayName?: string },
  store: Store = defaultStore
): Promise<SpokeContact> {
  const identity = draft.identity.trim();
  return publishContact(
    sdk,
    localIdentity,
    { identity, displayName: (draft.displayName || identity).trim(), relationship: "local" },
    {},
    store
  );
}

// Send a follow request to a peer and record a local "requested" edge.
export async function requestFollow(
  sdk: JoltEncryptedSdk & JoltIngressSdk,
  localIdentity: string,
  params: { identity: string; displayName?: string; message?: string; fromDisplayName?: string },
  store: Store = defaultStore
): Promise<{ request: SpokeFollowRequest; contact: SpokeContact }> {
  const identity = params.identity.trim();
  if (sameIdentity(identity, localIdentity)) {
    throw new Error("You cannot send a follow request to yourself.");
  }
  const request: SpokeFollowRequest = {
    schema: "spoke.follow_request.v1",
    id: makeId("follow_req"),
    sender: localIdentity,
    recipient: identity,
    displayName: (params.fromDisplayName || localIdentity).trim(),
    message: (params.message || "").trim(),
    createdAt: new Date().toISOString()
  };
  await sdk.sendObject(identity, `/spoke/outgoing/${request.id}`, request);
  const contact = await publishContact(
    sdk,
    localIdentity,
    { identity, displayName: (params.displayName || identity).trim(), relationship: "requested" },
    {},
    store
  );
  return { request, contact };
}

// Send a follow response (accepted/rejected) to the requester.
export async function sendFollowResponse(
  sdk: JoltIngressSdk,
  localIdentity: string,
  request: SpokeFollowRequest,
  decision: SpokeFollowResponse["decision"]
): Promise<SpokeFollowResponse> {
  const response: SpokeFollowResponse = {
    schema: "spoke.follow_response.v1",
    id: makeId("follow_resp"),
    requestId: request.id,
    sender: localIdentity,
    recipient: request.sender,
    decision,
    createdAt: new Date().toISOString()
  };
  await sdk.sendObject(request.sender, `/spoke/outgoing/${response.id}`, response);
  return response;
}

// Accept an incoming follow request: record an "accepted" edge and tell the
// requester. The peer becomes an active contact (auto-accepts their replies and
// messages per ADR 0002).
export async function acceptFollowRequest(
  sdk: JoltEncryptedSdk & JoltIngressSdk,
  localIdentity: string,
  request: SpokeFollowRequest,
  store: Store = defaultStore
): Promise<{ response: SpokeFollowResponse; contact: SpokeContact }> {
  if (sameIdentity(request.sender, localIdentity)) {
    throw new Error("Refusing to accept a follow request from your own identity.");
  }
  const contact = await publishContact(
    sdk,
    localIdentity,
    {
      identity: request.sender,
      displayName: request.displayName?.trim() || request.sender,
      relationship: "accepted"
    },
    {},
    store
  );
  const response = await sendFollowResponse(sdk, localIdentity, request, "accepted");
  return { response, contact };
}

// Apply a follow response we received about our own outbound request: an accept
// upgrades the edge to "accepted"; a reject tombstones it. Preserves the
// nickname we chose when we sent the request.
export async function applyIncomingResponse(
  sdk: JoltEncryptedSdk,
  localIdentity: string,
  response: SpokeFollowResponse,
  store: Store = defaultStore
): Promise<SpokeContact> {
  if (sameIdentity(response.sender, localIdentity)) {
    throw new Error("Refusing to apply a follow response from your own identity.");
  }
  const existing = storedContact(store, localIdentity, response.sender);
  const displayName = existing?.displayName || normalizeIdentity(response.sender);
  if (response.decision === "rejected") {
    return publishContact(
      sdk,
      localIdentity,
      { identity: response.sender, displayName, relationship: "requested" },
      { removed: true },
      store
    );
  }
  return publishContact(
    sdk,
    localIdentity,
    { identity: response.sender, displayName, relationship: "accepted" },
    {},
    store
  );
}

// Remove a contact: a tombstone edge. Excluded from the Projection, retained in
// the store for monotonicity.
export async function removeContact(
  sdk: JoltEncryptedSdk,
  localIdentity: string,
  identity: string,
  store: Store = defaultStore
): Promise<SpokeContact> {
  const existing = storedContact(store, localIdentity, identity);
  return publishContact(
    sdk,
    localIdentity,
    {
      identity,
      displayName: existing?.displayName || normalizeIdentity(identity),
      relationship: existing?.relationship || "local"
    },
    { removed: true },
    store
  );
}
