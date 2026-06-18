// Commands: the write half of the thread seam.
// - submitReply: a replier publishes their reply (Append Record) under their
//   own identity. It does NOT enter the accepted Projection; the post author
//   gates that. The replier sees it via the outbox overlay in selectThread.
// - acceptReply / unacceptReply: the post author records (or tombstones) an
//   accepted reference in their index, the authoritative thread state.

import type { JoltSdk } from "../jolt";
import { normalizeIdentity } from "../follow";
import { store as defaultStore, type Store } from "../common/store";
import {
  makeAcceptedRefPath,
  makeReplyPath,
  type AcceptedReplyRef,
  type SpokeReplyV2
} from "./model";
import type { ThreadEnumeration } from "./enumeration";

export async function submitReply(
  sdk: JoltSdk,
  reply: SpokeReplyV2,
  store: Store = defaultStore
): Promise<SpokeReplyV2> {
  const path = makeReplyPath(reply.postId, reply.id);
  const published = await sdk.publishJson(path, reply);
  const identity = normalizeIdentity(reply.sender);
  const existing = store.get({ identity, path });
  const latestSequence = Math.max(published.latestSequence, (existing?.latestSequence ?? -1) + 1);
  store.upsert({ identity, path, latestSequence, contentId: published.contentId, value: reply });
  return reply;
}

export async function acceptReply(
  sdk: JoltSdk,
  enumeration: ThreadEnumeration,
  reply: SpokeReplyV2,
  store: Store = defaultStore
): Promise<AcceptedReplyRef> {
  const ref: AcceptedReplyRef = {
    schema: "spoke.accepted_reply.v1",
    postId: reply.postId,
    replyId: reply.id,
    replyRef: { identity: reply.sender, path: makeReplyPath(reply.postId, reply.id) },
    acceptedAt: new Date().toISOString(),
    removed: false
  };
  const indexSequence = await enumeration.recordAccepted(reply.postId, ref);
  foldAcceptance(store, reply.postAuthor, ref, indexSequence);
  // Reflect the reply itself so the author sees it immediately; loadThread will
  // refresh it from the replier's namespace with a real sequence.
  const replyKey = normalizeIdentity(reply.sender);
  if (!store.get({ identity: replyKey, path: ref.replyRef.path })) {
    store.upsert({
      identity: replyKey,
      path: ref.replyRef.path,
      latestSequence: 0,
      contentId: `reply_${reply.id}`,
      value: reply
    });
  }
  return ref;
}

export async function unacceptReply(
  sdk: JoltSdk,
  enumeration: ThreadEnumeration,
  postAuthor: string,
  ref: AcceptedReplyRef,
  store: Store = defaultStore
): Promise<void> {
  const tombstone: AcceptedReplyRef = { ...ref, removed: true };
  const indexSequence = await enumeration.recordAccepted(ref.postId, tombstone);
  foldAcceptance(store, postAuthor, tombstone, indexSequence);
}

function foldAcceptance(
  store: Store,
  postAuthor: string,
  ref: AcceptedReplyRef,
  indexSequence: number
) {
  store.upsert({
    identity: normalizeIdentity(postAuthor),
    path: makeAcceptedRefPath(ref.postId, ref.replyId),
    latestSequence: indexSequence,
    contentId: `accepted_${ref.replyId}`,
    value: ref,
    tombstone: ref.removed === true
  });
}
