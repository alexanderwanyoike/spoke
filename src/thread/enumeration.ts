// Thread enumeration: the swappable seam for the accepted-reply Collection.
//
// Pre-J1, the post author maintains a per-post accepted-index Singleton at
// /spoke/threads/{postId} listing the accepted references. It holds only
// references to append-record replies (which live under the repliers), and the
// monotonic store - not this index - is what guarantees an accepted reference
// is never dropped. Card 104 swaps this module for J1 append-record
// enumeration without touching commands/loaders/queries.

import type { JoltSdk } from "../jolt";
import {
  decodeAcceptedIndex,
  makeThreadIndexPath,
  type AcceptedReplyRef,
  type SpokeAcceptedIndex
} from "./model";

export interface ThreadEnumeration {
  // List an author's accepted references for a post, with the index's version.
  listAccepted(
    postAuthor: string,
    postId: string
  ): Promise<{ entries: AcceptedReplyRef[]; latestSequence: number }>;
  // Record (or tombstone) an acceptance in the local author's index. Returns
  // the index's new sequence so callers can version the store consistently.
  recordAccepted(postId: string, ref: AcceptedReplyRef): Promise<number>;
}

export function createThreadBridge(
  sdk: JoltSdk,
  options: { localIdentity: string }
): ThreadEnumeration {
  return {
    async listAccepted(postAuthor, postId) {
      const hit = await sdk.read(
        { identity: postAuthor, path: makeThreadIndexPath(postId) },
        decodeAcceptedIndex
      );
      return { entries: hit?.value.entries ?? [], latestSequence: hit?.latestSequence ?? 0 };
    },
    async recordAccepted(postId, ref) {
      const hit = await sdk.read(
        { identity: options.localIdentity, path: makeThreadIndexPath(postId) },
        decodeAcceptedIndex
      );
      const entries = [
        ref,
        ...(hit?.value.entries ?? []).filter((entry) => entry.replyId !== ref.replyId)
      ];
      const nextIndex: SpokeAcceptedIndex = {
        schema: "spoke.accepted_index.v1",
        postId,
        owner: options.localIdentity,
        updatedAt: new Date().toISOString(),
        entries
      };
      const published = await sdk.publishJson(makeThreadIndexPath(postId), nextIndex);
      return published.latestSequence;
    }
  };
}
