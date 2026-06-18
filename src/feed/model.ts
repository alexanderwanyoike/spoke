import type { Decoder } from "../jolt";
import type { SpokeAttachment } from "../media";
// The contact graph belongs to the follow feature (ADR 0004). Re-exported here
// so existing feed consumers keep importing Contact/activeContacts from "@/feed".
import { activeContacts } from "../follow";
import type { Contact } from "../follow";

export { activeContacts };
export type { Contact };

export type SpokePost = {
  schema: "spoke.post.v1" | "spoke.post.v2";
  id: string;
  author: string;
  displayName?: string;
  title: string;
  body: string;
  createdAt: string;
  path: string;
  threadPath?: string;
  attachments?: SpokeAttachment[];
};

export type FeedItem = {
  source: "local" | "contact";
  contact?: Contact;
  post: SpokePost;
  address: string;
};

export function sortFeed(items: FeedItem[]) {
  return [...items].sort((a, b) => b.post.createdAt.localeCompare(a.post.createdAt));
}

export function displayNameForFeedItem(item: FeedItem) {
  if (item.source === "contact") {
    return item.contact?.displayName || item.post.displayName || item.post.author;
  }

  return item.post.displayName || item.post.author;
}

export const POSTS_PREFIX = "/spoke/posts/";

export function makePostPath(id: string) {
  return `${POSTS_PREFIX}${id}`;
}

export function isSpokePost(value: unknown): value is SpokePost {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const schema = (value as { schema?: unknown }).schema;
  return schema === "spoke.post.v1" || schema === "spoke.post.v2";
}

// Tolerant readers: validate an already-parsed JSON value into a canonical
// model, or null if unrecoverable. The ACL handles bytes -> JSON; this is the
// schema-level decoder (see docs/CONTEXT.md "Tolerant readers, strict writers").
export const decodePost: Decoder<SpokePost> = (value) => (isSpokePost(value) ? value : null);
