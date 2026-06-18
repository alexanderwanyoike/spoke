// Queries: the read half of the thread seam. selectThread folds the store into
// a nested reply tree: a reply is shown when the post author has accepted it
// (its reference is in the accepted Collection and not tombstoned), when the
// local user authored it (outbox overlay), or when it is legacy v1 (read-only,
// already accepted under the old model). Synchronous and side-effect-free.

import { useMemo, useSyncExternalStore } from "react";
import { normalizeIdentity, sameIdentity } from "../follow";
import { store as defaultStore, type Store, type StoreSnapshot } from "../common/store";
import type { SpokeReply } from "../api";
import {
  ACCEPTED_PREFIX,
  REPLIES_PREFIX,
  buildThreadTree,
  normalizeReply,
  type AcceptedReplyRef,
  type SpokeReplyV2,
  type ThreadNode,
  type ThreadReply
} from "./model";

export type ThreadScope = {
  postId: string;
  postAuthor: string;
  localIdentity?: string;
};

export function selectThread(snapshot: StoreSnapshot, scope: ThreadScope): ThreadNode[] {
  const authorKey = normalizeIdentity(scope.postAuthor);
  const acceptedPrefix = `${ACCEPTED_PREFIX}${scope.postId}/`;

  const accepted = new Set<string>();
  for (const entry of snapshot.values()) {
    if (entry.tombstone) continue;
    if (entry.identity === authorKey && entry.path.startsWith(acceptedPrefix)) {
      accepted.add((entry.value as AcceptedReplyRef).replyId);
    }
  }

  const nodes: ThreadReply[] = [];
  for (const entry of snapshot.values()) {
    if (entry.tombstone || !entry.path.startsWith(REPLIES_PREFIX)) continue;
    const node = normalizeReply(entry.value as SpokeReplyV2 | SpokeReply);
    if (node.postId !== scope.postId) continue;
    const isOwn = scope.localIdentity ? sameIdentity(node.sender, scope.localIdentity) : false;
    // Legacy v1 replies were accepted under the old model; render read-only.
    const isLegacy = node.schema === "spoke.reply.v1";
    if (accepted.has(node.id) || isOwn || isLegacy) {
      nodes.push(node);
    }
  }

  return buildThreadTree(nodes);
}

export function useThread(scope: ThreadScope, store: Store = defaultStore): ThreadNode[] {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return useMemo(
    () => selectThread(snapshot, scope),
    [snapshot, scope.postId, scope.postAuthor, scope.localIdentity]
  );
}

export function readThread(scope: ThreadScope, store: Store = defaultStore): ThreadNode[] {
  return selectThread(store.getSnapshot(), scope);
}

function scopesKey(scopes: ThreadScope[]): string {
  return scopes.map((s) => `${s.postId}@${s.postAuthor}#${s.localIdentity ?? ""}`).join("|");
}

// Project several threads at once (one store subscription) for a feed of posts.
// Returns a map keyed by postId so a render loop can look each thread up without
// calling a hook per item.
export function useThreads(
  scopes: ThreadScope[],
  store: Store = defaultStore
): Record<string, ThreadNode[]> {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const key = scopesKey(scopes);
  return useMemo(() => {
    const byPost: Record<string, ThreadNode[]> = {};
    for (const scope of scopes) {
      byPost[scope.postId] = selectThread(snapshot, scope);
    }
    return byPost;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, key]);
}
