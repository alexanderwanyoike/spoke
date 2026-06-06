import type { SpokeReply } from "./api";

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
