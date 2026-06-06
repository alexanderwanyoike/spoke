import type { PublishedContent, SpokeFeedIndex, SpokePost } from "./api";

export type Contact = {
  identity: string;
  displayName: string;
};

export type FeedItem = {
  source: "local" | "contact";
  contact?: Contact;
  post: SpokePost;
  address: string;
};

export type LocalPostReference = {
  path: string;
  address?: string | null;
  contentId?: string;
};

export function sortFeed(items: FeedItem[]) {
  return [...items].sort((a, b) => b.post.createdAt.localeCompare(a.post.createdAt));
}

export function isFeedItem(item: FeedItem | null): item is FeedItem {
  return item !== null;
}

export function displayNameForFeedItem(item: FeedItem) {
  if (item.source === "contact") {
    return item.contact?.displayName || item.post.displayName || item.post.author;
  }

  return item.post.displayName || item.post.author;
}

export function removeContactFeedItems(items: FeedItem[], identity: string) {
  return items.filter((item) => item.source !== "contact" || item.contact?.identity !== identity);
}

export function addOptimisticLocalPost(items: FeedItem[], post: SpokePost, address: string) {
  return sortFeed([
    {
      source: "local",
      post,
      address
    },
    ...items.filter((item) => item.address !== address)
  ]);
}

export function latestPublishedByPath(items: PublishedContent[], path: string) {
  return items
    .filter((item) => item.path === path)
    .sort((a, b) => (b.local_sequence ?? 0) - (a.local_sequence ?? 0))[0];
}

export function withLocalContentIds(index: SpokeFeedIndex, published: PublishedContent[]) {
  const contentByPath = new Map(
    published
      .filter((item) => item.path?.startsWith("/spoke/posts/"))
      .map((item) => [item.path, item.content_id])
  );

  return {
    ...index,
    posts: index.posts.map((item) => ({
      ...item,
      contentId: item.contentId || contentByPath.get(item.path)
    }))
  };
}

export function mergeFeedSnapshot(current: FeedItem[], snapshot: FeedItem[]) {
  const snapshotAddresses = new Set(snapshot.map((item) => item.address));
  const optimisticLocalItems = current.filter(
    (item) => item.source === "local" && !snapshotAddresses.has(item.address)
  );
  return sortFeed([...snapshot, ...optimisticLocalItems]);
}

export function mergeLocalFeedSnapshot(current: FeedItem[], localSnapshot: FeedItem[]) {
  return sortFeed([
    ...localSnapshot,
    ...current.filter((item) => item.source !== "local")
  ]);
}

export function localPostReferences(
  index: SpokeFeedIndex | null,
  published: PublishedContent[]
): LocalPostReference[] {
  const refs = new Map<string, LocalPostReference>();

  for (const item of index?.posts || []) {
    refs.set(item.path, {
      path: item.path,
      contentId: item.contentId,
      address: item.address
    });
  }

  for (const item of published.filter((entry) => entry.path?.startsWith("/spoke/posts/"))) {
    if (!item.path) continue;
    const current = refs.get(item.path);
    refs.set(item.path, {
      path: item.path,
      address: item.address || current?.address,
      contentId: item.content_id
    });
  }

  return [...refs.values()];
}
