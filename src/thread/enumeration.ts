// Thread enumeration: the accepted-reply Collection, read through Jolt's
// append-record enumeration (J1). The post author publishes one accepted-reference
// append record per accepted reply under /spoke/accepted/{postId}/{replyId};
// listing that prefix is the Collection read. A tombstone (removed: true) is a
// newer append record at the same path. The monotonic store - not the listing -
// guarantees an accepted reference is never dropped.

import type { JoltAppendSdk, JoltSdk } from "../jolt";
import {
  decodeAcceptedReplyRef,
  makeAcceptedPrefix,
  makeAcceptedRefPath,
  type AcceptedReplyRef
} from "./model";

export interface ThreadEnumeration {
  // List an author's accepted references for a post, with the version to fold
  // each reference into the store at.
  listAccepted(
    postAuthor: string,
    postId: string
  ): Promise<{ entries: Array<{ ref: AcceptedReplyRef; latestSequence: number }> }>;
  // Record (or tombstone) an acceptance as an append record under the author.
  // Returns the record's sequence so callers can version the store consistently.
  recordAccepted(postId: string, ref: AcceptedReplyRef): Promise<number>;
}

export function createJoltThreadEnumeration(sdk: JoltSdk & JoltAppendSdk): ThreadEnumeration {
  return {
    async listAccepted(postAuthor, postId) {
      const records = await sdk.enumerate(postAuthor, makeAcceptedPrefix(postId));
      const entries = await Promise.all(
        records.map(async (record) => {
          const logicalRef = { identity: postAuthor, path: record.path };
          const hit = await sdk.readContent(
            record.contentId,
            logicalRef,
            record.deviceSequence,
            decodeAcceptedReplyRef
          );
          if (!hit) return null;
          return { ref: hit.value, latestSequence: hit.latestSequence };
        })
      );
      return { entries: entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null) };
    },
    async recordAccepted(postId, ref) {
      const published = await sdk.publishAppend(makeAcceptedRefPath(postId, ref.replyId), ref);
      return published.latestSequence;
    }
  };
}
