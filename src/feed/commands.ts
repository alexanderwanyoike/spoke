// Commands: the write half of the feed seam. publishPost publishes the post as
// an Append Record, records it in the enumeration bridge so others can discover
// it, and folds it into the monotonic store.

import type { JoltSdk } from "../jolt";
import { normalizeIdentity } from "../follow";
import { store as defaultStore, type Store } from "../common/store";
import type { SpokePost } from "../api";
import type { EnumerationSource } from "./enumeration";

export async function publishPost(
  sdk: JoltSdk,
  enumeration: EnumerationSource,
  post: SpokePost,
  store: Store = defaultStore
): Promise<{ post: SpokePost; address: string }> {
  const published = await sdk.publishJson(post.path, post);
  await enumeration.recordPost(post, published);

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
