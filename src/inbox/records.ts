// The review queue is polled every couple of seconds. Handing React a fresh
// array each time re-rendered the whole app even when nothing had arrived, so
// the poll keeps the previous array unless a record appeared, left, or
// changed status.

import type { IngressRecord } from "../jolt";

export function sameIngressRecords(current: IngressRecord[], next: IngressRecord[]): boolean {
  if (current.length !== next.length) return false;
  return current.every(
    (record, index) =>
      record.ingress_id === next[index].ingress_id && record.status === next[index].status
  );
}

export function reconcileIngressRecords(
  current: IngressRecord[],
  next: IngressRecord[]
): IngressRecord[] {
  return sameIngressRecords(current, next) ? current : next;
}
