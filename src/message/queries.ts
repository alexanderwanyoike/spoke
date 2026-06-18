// Queries: the read half of the message seam. selectConversations folds the
// local user's message copies out of the store, deriving each message's
// direction from its path, into a Projection keyed by conversation id.
// Synchronous and side-effect-free.

import { useMemo, useSyncExternalStore } from "react";
import { normalizeIdentity } from "../follow";
import { store as defaultStore, type Store, type StoreSnapshot } from "../common/store";
import {
  conversationsFromMessages,
  directionForPath,
  type ConversationMessage,
  type ConversationsById,
  type SpokeMessage
} from "./model";

export function selectConversations(
  snapshot: StoreSnapshot,
  localIdentity: string
): ConversationsById {
  const owner = normalizeIdentity(localIdentity);
  const items: ConversationMessage[] = [];
  for (const entry of snapshot.values()) {
    if (entry.tombstone || entry.identity !== owner) continue;
    const direction = directionForPath(entry.path);
    if (!direction) continue;
    items.push({ message: entry.value as SpokeMessage, direction });
  }
  return conversationsFromMessages(items);
}

export function readConversations(
  localIdentity: string,
  store: Store = defaultStore
): ConversationsById {
  return selectConversations(store.getSnapshot(), localIdentity);
}

export function useConversations(
  localIdentity: string,
  store: Store = defaultStore
): ConversationsById {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return useMemo(() => selectConversations(snapshot, localIdentity), [snapshot, localIdentity]);
}
