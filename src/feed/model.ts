import type { PublishedContent, SpokeFeedIndex, SpokePost } from "../api";
import type { Decoder } from "../jolt";

export type Contact = {
  identity: string;
  /** Local nickname chosen by this user. */
  displayName: string;
  relationship?: "local" | "requested" | "accepted";
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

export function activeContacts(contacts: Contact[]) {
  return contacts.filter((contact) => contact.relationship !== "requested");
}

export function latestPublishedByPath(items: PublishedContent[], path: string) {
  return items
    .filter((item) => item.path === path)
    .sort((a, b) => (b.local_sequence ?? 0) - (a.local_sequence ?? 0))[0];
}

export const FEED_PATH = "/spoke/feed";
export const POSTS_PREFIX = "/spoke/posts/";

export function isSpokePost(value: unknown): value is SpokePost {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const schema = (value as { schema?: unknown }).schema;
  return schema === "spoke.post.v1" || schema === "spoke.post.v2";
}

export function isSpokeFeedIndex(value: unknown): value is SpokeFeedIndex {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return (value as { schema?: unknown }).schema === "spoke.feed.v1";
}

// Tolerant readers: validate an already-parsed JSON value into a canonical
// model, or null if unrecoverable. The ACL handles bytes -> JSON; these are the
// schema-level decoders (see docs/CONTEXT.md "Tolerant readers, strict writers").
export const decodePost: Decoder<SpokePost> = (value) => (isSpokePost(value) ? value : null);

export const decodeFeedIndex: Decoder<SpokeFeedIndex> = (value) =>
  isSpokeFeedIndex(value) ? value : null;

// Build the next feed-index Singleton including a freshly published post. This
// is the write side of the bridge enumeration; J1's append-record enumeration
// will make it unnecessary (card 104).
export function feedIndexWithPost(
  existing: SpokeFeedIndex | null,
  post: SpokePost,
  published: { contentId: string; address?: string | null }
): SpokeFeedIndex {
  return {
    schema: "spoke.feed.v1",
    owner: post.author,
    updatedAt: new Date().toISOString(),
    posts: [
      {
        id: post.id,
        path: post.path,
        contentId: published.contentId,
        address: published.address ?? null,
        title: post.title,
        createdAt: post.createdAt
      },
      ...(existing?.posts || []).filter((item) => item.id !== post.id)
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  };
}
