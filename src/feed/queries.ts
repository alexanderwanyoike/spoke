// Queries: the read half of the feed seam. selectFeed folds every post in the
// store into a sorted Projection scoped to the local user and active contacts;
// useFeed wires it to the store. Synchronous and side-effect-free.

import { useMemo, useSyncExternalStore } from "react";
import { normalizeIdentity } from "../follow";
import { store as defaultStore, type Store, type StoreSnapshot } from "../common/store";
import type { SpokePost } from "../api";
import { activeContacts, sortFeed, POSTS_PREFIX, type Contact, type FeedItem } from "./model";

export type FeedScope = {
  localIdentity: string;
  contacts: Contact[];
};

export function selectFeed(snapshot: StoreSnapshot, scope: FeedScope): FeedItem[] {
  // Map each in-scope normalized identity to how its posts should be sourced.
  const bySource = new Map<string, { source: "local" | "contact"; contact?: Contact }>();
  if (scope.localIdentity) {
    bySource.set(normalizeIdentity(scope.localIdentity), { source: "local" });
  }
  for (const contact of activeContacts(scope.contacts)) {
    const key = normalizeIdentity(contact.identity);
    // The local mapping wins if a contact shares the local identity.
    if (!bySource.has(key)) {
      bySource.set(key, { source: "contact", contact });
    }
  }

  const items: FeedItem[] = [];
  for (const entry of snapshot.values()) {
    if (entry.tombstone || !entry.path.startsWith(POSTS_PREFIX)) continue;
    const sourced = bySource.get(entry.identity);
    if (!sourced) continue;
    const post = entry.value as SpokePost;
    items.push({
      source: sourced.source,
      contact: sourced.contact,
      post,
      address: `${post.author}${post.path}`
    });
  }
  return sortFeed(items);
}

// Imperative read of the current feed Projection from the default store, for
// use inside async flows (e.g. reply hydration) without subscribing. React
// rendering should use useFeed; this never touches the store from a component.
export function readFeed(scope: FeedScope, store: Store = defaultStore): FeedItem[] {
  return selectFeed(store.getSnapshot(), scope);
}

export function useFeed(scope: FeedScope, store: Store = defaultStore): FeedItem[] {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return useMemo(
    () => selectFeed(snapshot, scope),
    [snapshot, scope.localIdentity, scope.contacts]
  );
}
