// Follow / contacts model: types + pure domain helpers and tolerant decoders.
// The contact graph is a Collection of append records encrypted to self (ADR
// 0004): each edge is its own publication under the local identity at
// /spoke/contacts/{identity}. This file owns the wire schema, the projection
// type, and the schema-level decoders; commands/loaders/queries do the IO.

import type { Decoder } from "../jolt";

export type ContactRelationship = "local" | "requested" | "accepted";

// The projection type the app renders. Derived from the contact Collection (or,
// during migration, from legacy localStorage).
export type Contact = {
  identity: string;
  /** Local nickname chosen by this user. */
  displayName: string;
  relationship?: ContactRelationship;
};

// One contact edge as published (encrypted to self) under /spoke/contacts/{id}.
export type SpokeContact = {
  schema: "spoke.contact.v1";
  identity: string;
  displayName: string;
  relationship: ContactRelationship;
  updatedAt: string;
  // A tombstone: the edge is retained in the store for monotonicity but
  // excluded from the contacts Projection. The only way a contact is removed.
  removed?: boolean;
};

export type SpokeFollowRequest = {
  schema: "spoke.follow_request.v1";
  id: string;
  sender: string;
  recipient: string;
  displayName?: string;
  message: string;
  createdAt: string;
};

export type SpokeFollowResponse = {
  schema: "spoke.follow_response.v1";
  id: string;
  requestId: string;
  sender: string;
  recipient: string;
  decision: "accepted" | "rejected";
  createdAt: string;
};

export type SpokeIncomingObject = SpokeFollowRequest | SpokeFollowResponse;

export const CONTACTS_PREFIX = "/spoke/contacts/";

export function normalizeIdentity(identity: string) {
  const trimmed = identity.trim();
  return trimmed.endsWith(".jolt") ? trimmed.slice(0, -".jolt".length) : trimmed;
}

export function sameIdentity(left: string, right: string) {
  return normalizeIdentity(left) === normalizeIdentity(right);
}

// Each edge lives at its own path keyed by the normalized contact identity, so
// "bob" and "bob.jolt" address the same edge across relationship transitions.
export function makeContactPath(identity: string) {
  return `${CONTACTS_PREFIX}${normalizeIdentity(identity)}`;
}

export function displayNameForContact(contact: Contact) {
  return contact.displayName || contact.identity;
}

// Hide still-pending outbound follow requests from the active-contact set (used
// by the feed and message threads): a "requested" contact is not yet a peer.
export function activeContacts(contacts: Contact[]) {
  return contacts.filter((contact) => contact.relationship !== "requested");
}

export function upsertContact(contacts: Contact[], next: Contact) {
  return [next, ...contacts.filter((contact) => !sameIdentity(contact.identity, next.identity))];
}

export function requestContactFromDraft(identity: string, displayName: string): Contact {
  const normalizedIdentity = identity.trim();
  return {
    identity: normalizedIdentity,
    displayName: displayName.trim() || normalizedIdentity,
    relationship: "requested"
  };
}

export function acceptedContactFromRequest(request: SpokeFollowRequest): Contact {
  return {
    identity: request.sender,
    displayName: request.displayName?.trim() || request.sender,
    relationship: "accepted"
  };
}

export function applyFollowResponse(contacts: Contact[], response: SpokeFollowResponse) {
  if (response.decision === "rejected") {
    return contacts.filter((contact) => !sameIdentity(contact.identity, response.sender));
  }

  return contacts.map((contact) =>
    sameIdentity(contact.identity, response.sender)
      ? { ...contact, relationship: "accepted" as const }
      : contact
  );
}

export function hasRequestedContactForResponse(contacts: Contact[], response: SpokeFollowResponse) {
  return contacts.some(
    (contact) =>
      contact.relationship === "requested" && sameIdentity(contact.identity, response.sender)
  );
}

export function hasAcceptedContactForIdentity(contacts: Contact[], identity: string) {
  return contacts.some(
    (contact) => contact.relationship === "accepted" && sameIdentity(contact.identity, identity)
  );
}

export function isSpokeFollowRequest(value: unknown): value is SpokeFollowRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { schema?: unknown }).schema === "spoke.follow_request.v1"
  );
}

export function isSpokeFollowResponse(value: unknown): value is SpokeFollowResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { schema?: unknown }).schema === "spoke.follow_response.v1"
  );
}

export function isSpokeContact(value: unknown): value is SpokeContact {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { schema?: unknown }).schema === "spoke.contact.v1"
  );
}

// Tolerant readers: validate an already-parsed JSON value into a canonical
// model, or null if unrecoverable (the ACL handles bytes -> JSON).
export const decodeContact: Decoder<SpokeContact> = (value) =>
  isSpokeContact(value) ? value : null;

export const decodeFollowRequest: Decoder<SpokeFollowRequest> = (value) =>
  isSpokeFollowRequest(value) ? value : null;

export const decodeFollowResponse: Decoder<SpokeFollowResponse> = (value) =>
  isSpokeFollowResponse(value) ? value : null;

// Project a stored contact record into the app's Contact view model.
export function contactFromRecord(record: SpokeContact): Contact {
  return {
    identity: record.identity,
    displayName: record.displayName || record.identity,
    relationship: record.relationship
  };
}
