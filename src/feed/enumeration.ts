// Enumeration: the swappable seam for discovering a Collection's records.
//
// Jolt does not yet expose an app API to list append records under a path
// prefix, so the feed is read today through a Spoke-maintained index (the
// "bridge"): each identity publishes a /spoke/feed Singleton listing its posts.
// The bridge is best-effort and only fully correct single-device; the monotonic
// store (not the index) is what guarantees a known post is never dropped. Card
// 104 swaps this whole module for the J1 append-record enumeration without
// touching commands/loaders/queries.

import type { JoltSdk, PublishResult } from "../jolt";
import type { PublishedContent, SpokeFeedIndex, SpokePost } from "../api";
import { sameIdentity } from "../follow";
import { decodeFeedIndex, feedIndexWithPost, FEED_PATH, POSTS_PREFIX } from "./model";

export type PostRef = {
  id: string;
  path: string;
  author: string;
  contentId?: string;
  address?: string | null;
  createdAt?: string;
  title?: string;
};

export interface EnumerationSource {
  // List the post references published by an identity.
  listPosts(identity: string): Promise<PostRef[]>;
  // Record a freshly published post so other readers can enumerate it.
  recordPost(post: SpokePost, published: PublishResult): Promise<void>;
}

export type BridgeOptions = {
  localIdentity: string;
  // The local node's published inventory. Used only for the local identity to
  // catch posts the feed index missed (orphan safety); remote identities are
  // read index-only.
  listLocalPosts: () => Promise<PublishedContent[]>;
};

export function createBridgeEnumeration(sdk: JoltSdk, options: BridgeOptions): EnumerationSource {
  async function readIndex(identity: string): Promise<SpokeFeedIndex | null> {
    try {
      const read = await sdk.read({ identity, path: FEED_PATH });
      return decodeFeedIndex(read.bytes);
    } catch {
      return null;
    }
  }

  return {
    async listPosts(identity) {
      const index = await readIndex(identity);
      const refs = new Map<string, PostRef>();
      for (const item of index?.posts || []) {
        refs.set(item.path, {
          id: item.id,
          path: item.path,
          author: identity,
          contentId: item.contentId,
          address: item.address,
          createdAt: item.createdAt,
          title: item.title
        });
      }

      if (sameIdentity(identity, options.localIdentity)) {
        const published = await options.listLocalPosts().catch(() => []);
        for (const item of published) {
          if (!item.path?.startsWith(POSTS_PREFIX)) continue;
          const current = refs.get(item.path);
          refs.set(item.path, {
            id: current?.id || item.path.slice(POSTS_PREFIX.length),
            path: item.path,
            author: identity,
            contentId: item.content_id,
            address: item.address || current?.address,
            createdAt: current?.createdAt,
            title: current?.title
          });
        }
      }

      return [...refs.values()];
    },

    async recordPost(post, published) {
      const existing = await readIndex(options.localIdentity);
      const nextIndex = feedIndexWithPost(existing, post, published);
      await sdk.publishJson(FEED_PATH, nextIndex);
    }
  };
}
