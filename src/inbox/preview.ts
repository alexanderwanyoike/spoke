// Presentation of a decoded incoming payload for the review queue. A follow
// request carries the sender's self-declared display name; showing it is the
// difference between "Bran wants to follow you" and a bare identity id when
// the sender has no public profile yet.

import {
  isSpokeFollowRequest,
  isSpokeFollowResponse,
  type SpokeFollowRequest,
  type SpokeFollowResponse
} from "../follow";
import { isSpokeMessage, messagePreview, type SpokeMessage } from "../message";
import { normalizeIdentity, sameIdentity } from "../follow";

export type SpokeIncomingPayload =
  | SpokeFollowRequest
  | SpokeFollowResponse
  | SpokeMessage
  | { body: string; [key: string]: unknown };

export function incomingKind(payload: SpokeIncomingPayload): string {
  if (isSpokeFollowRequest(payload)) return "follow request";
  if (isSpokeFollowResponse(payload)) return "follow response";
  if (isSpokeMessage(payload)) return "message";
  return "reply";
}

// The sender's own name for themselves, when it is more than their id.
export function incomingSenderName(payload: SpokeIncomingPayload): string | undefined {
  if (!isSpokeFollowRequest(payload)) return undefined;
  const name = (payload.displayName || "").trim();
  if (!name || sameIdentity(name, payload.sender) || name === normalizeIdentity(payload.sender)) {
    return undefined;
  }
  return name;
}

export function incomingPreview(payload: SpokeIncomingPayload): string {
  if (isSpokeFollowRequest(payload)) {
    return (
      payload.message || `${incomingSenderName(payload) || payload.sender} wants to follow you.`
    );
  }
  if (isSpokeFollowResponse(payload)) {
    return `${payload.sender} ${payload.decision} your follow request.`;
  }
  if (isSpokeMessage(payload)) {
    return messagePreview(payload);
  }
  return payload.body;
}
