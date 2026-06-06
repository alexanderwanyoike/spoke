import type { SpokeReply } from "./api";
import type { Contact } from "./feed";
import { sameIdentity } from "./identity";

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

export function displayNameForReply(
  reply: SpokeReply,
  contacts: Contact[],
  localIdentity: string,
  localDisplayName: string
) {
  if (sameIdentity(reply.sender, localIdentity)) {
    return localDisplayName || localIdentity;
  }

  return contacts.find((contact) => sameIdentity(contact.identity, reply.sender))?.displayName || reply.sender;
}
