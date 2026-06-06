import type { IngressRecord } from "./api";
import type { Contact } from "./feed";
import { sameIdentity } from "./identity";

export function isKnownContactIngress(record: IngressRecord, contacts: Contact[]) {
  return contacts.some((contact) => sameIdentity(contact.identity, record.sender_identity));
}

export function visibleManualIngress(records: IngressRecord[], contacts: Contact[]) {
  return records.filter((record) => !isKnownContactIngress(record, contacts));
}
