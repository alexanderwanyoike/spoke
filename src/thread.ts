import { makeThreadPath, type PublishResponse, type SpokeReply, type SpokeThreadIndex } from "./api";

export type RepliesByPost = Record<string, SpokeReply[]>;

export function sortReplies(replies: SpokeReply[]) {
  return [...replies].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function addReplyToPost(current: RepliesByPost, reply: SpokeReply): RepliesByPost {
  const existing = current[reply.postAddress] || [];
  return {
    ...current,
    [reply.postAddress]: sortReplies([
      ...existing.filter((item) => item.id !== reply.id),
      reply
    ])
  };
}

export function postIdFromPostAddress(postAddress: string) {
  const marker = "/spoke/posts/";
  const markerIndex = postAddress.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error("Reply post address must point at /spoke/posts/.");
  }

  const postId = postAddress.slice(markerIndex + marker.length).split("/")[0];
  if (!postId) {
    throw new Error("Reply post address is missing a post id.");
  }
  return postId;
}

export function threadPathForPostAddress(postAddress: string) {
  return makeThreadPath(postIdFromPostAddress(postAddress));
}

export function upsertReplyInThreadIndex(
  existing: SpokeThreadIndex | null,
  reply: SpokeReply,
  publishedReply: Pick<PublishResponse, "address" | "content_id">
): SpokeThreadIndex {
  const postId = postIdFromPostAddress(reply.postAddress);
  const nextReply = {
    id: reply.id,
    sender: reply.sender,
    address: publishedReply.address,
    contentId: publishedReply.content_id,
    createdAt: reply.createdAt,
    moderation: "accepted" as const
  };

  return {
    schema: "spoke.thread.v1",
    id: existing?.id || `thread_${postId}`,
    owner: existing?.owner || reply.postAuthor,
    postAddress: existing?.postAddress || reply.postAddress,
    visibility: "public",
    updatedAt: new Date().toISOString(),
    replies: [
      nextReply,
      ...(existing?.replies || []).filter((item) => item.id !== reply.id)
    ].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  };
}
