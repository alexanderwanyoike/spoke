// Loaders: the read-path hydration for the feed. For each identity, enumerate
// its posts through the bridge, read each one, and fold it into the store. The
// merge is monotonic and additive (ADR 0003): an incomplete enumeration can
// never drop a post the store already knows.

import type { JoltSdk } from "../jolt";
import { normalizeIdentity } from "../follow";
import { store as defaultStore, type Store } from "../common/store";
import { decodePost } from "./model";
import type { EnumerationSource } from "./enumeration";

async function loadAuthorPosts(
  sdk: JoltSdk,
  enumeration: EnumerationSource,
  identity: string,
  store: Store
): Promise<void> {
  const refs = await enumeration.listPosts(identity);
  await Promise.all(
    refs.map(async (ref) => {
      try {
        const read = await sdk.read({ identity, path: ref.path });
        const post = decodePost(read.bytes);
        if (!post) return;
        store.upsert({
          identity: normalizeIdentity(identity),
          path: ref.path,
          latestSequence: read.latestSequence,
          contentId: read.contentId,
          value: post
        });
      } catch {
        // A stale enumeration entry should not block the rest of the timeline.
      }
    })
  );
}

export async function loadFeed(
  sdk: JoltSdk,
  enumeration: EnumerationSource,
  identities: string[],
  store: Store = defaultStore
): Promise<void> {
  await Promise.all(
    identities
      .filter(Boolean)
      .map((identity) => loadAuthorPosts(sdk, enumeration, identity, store).catch(() => {}))
  );
}
