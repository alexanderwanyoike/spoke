// Queries: the read half of the contacts seam. selectContacts folds the
// local user's contact Collection out of the store into the app's Contact view
// model, excluding tombstoned edges. Synchronous and side-effect-free.

import { useMemo, useSyncExternalStore } from "react";
import { store as defaultStore, type Store, type StoreSnapshot } from "../common/store";
import {
  CONTACTS_PREFIX,
  contactFromRecord,
  normalizeIdentity,
  type Contact,
  type SpokeContact
} from "./model";

export function selectContacts(snapshot: StoreSnapshot, localIdentity: string): Contact[] {
  const owner = normalizeIdentity(localIdentity);
  const contacts: Contact[] = [];
  for (const entry of snapshot.values()) {
    if (entry.tombstone) continue;
    if (entry.identity !== owner || !entry.path.startsWith(CONTACTS_PREFIX)) continue;
    contacts.push(contactFromRecord(entry.value as SpokeContact));
  }
  // Stable display order, independent of store iteration order.
  return contacts.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// Imperative read for async flows (e.g. inbox auto-accept rules) that need the
// current contact set without subscribing. React rendering uses useContacts.
export function readContacts(localIdentity: string, store: Store = defaultStore): Contact[] {
  return selectContacts(store.getSnapshot(), localIdentity);
}

export function useContacts(localIdentity: string, store: Store = defaultStore): Contact[] {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return useMemo(() => selectContacts(snapshot, localIdentity), [snapshot, localIdentity]);
}
