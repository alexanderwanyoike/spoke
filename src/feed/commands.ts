// Commands: the write half of the feed seam. publishPost writes the post as a
// Jolt append record (J1) under its own path, so it coexists with concurrent
// records and is discoverable by enumeration, and folds it into the monotonic
// store. There is no separate index to maintain.

import type { JoltAppendSdk } from "../jolt";
import { normalizeIdentity } from "../follow";
import { store as defaultStore, type Store } from "../common/store";
import type { SpokePost } from "./model";

export async function publishPost(
  sdk: JoltAppendSdk,
  post: SpokePost,
  store: Store = defaultStore
): Promise<{ post: SpokePost; address: string }> {
  const published = await sdk.publishAppend(post.path, post);

  const identity = normalizeIdentity(post.author);
  const existing = store.get({ identity, path: post.path });
  const latestSequence = Math.max(published.latestSequence, (existing?.latestSequence ?? -1) + 1);
  store.upsert({
    identity,
    path: post.path,
    latestSequence,
    contentId: published.contentId,
    value: post
  });

  return { post, address: published.address || `${post.author}${post.path}` };
}
