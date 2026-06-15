import type { Contact } from "./feed";

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

export function normalizeIdentity(identity: string) {
  const trimmed = identity.trim();
  return trimmed.endsWith(".jolt") ? trimmed.slice(0, -".jolt".length) : trimmed;
}

export function sameIdentity(left: string, right: string) {
  return normalizeIdentity(left) === normalizeIdentity(right);
}

export function displayNameForContact(contact: Contact) {
  return contact.displayName || contact.identity;
}

export function upsertContact(contacts: Contact[], next: Contact) {
  return [
    next,
    ...contacts.filter((contact) => !sameIdentity(contact.identity, next.identity))
  ];
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

export function hasRequestedContactForResponse(
  contacts: Contact[],
  response: SpokeFollowResponse
) {
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
