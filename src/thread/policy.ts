// Acceptance policy: what admits a reply to the authoritative thread index.
// Author-anchored (ADR 0002): auto-accept replies from the author's contacts,
// queue replies from strangers for manual review. A pure function so it is
// testable and changeable without touching the data model.

import type { Contact } from "../feed";
import { hasAcceptedContactForIdentity } from "../follow";

export type AcceptanceDecision = "auto" | "manual";

export function acceptanceDecision(input: { sender: string; contacts: Contact[] }): AcceptanceDecision {
  return hasAcceptedContactForIdentity(input.contacts, input.sender) ? "auto" : "manual";
}
