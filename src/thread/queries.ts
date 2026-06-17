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
