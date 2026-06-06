import type { IngressRecord } from "./api";
import type { Contact } from "./feed";

export function isKnownContactIngress(record: IngressRecord, contacts: Contact[]) {
  return contacts.some((contact) => contact.identity === record.sender_identity);
}

export function visibleManualIngress(records: IngressRecord[], contacts: Contact[]) {
  return records.filter((record) => !isKnownContactIngress(record, contacts));
}
