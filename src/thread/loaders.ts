// Loaders: read-path hydration for a thread. Enumerate the author's accepted
// references, fetch each referenced reply from its replier's namespace, and
// fold everything into the monotonic store. Additive + monotonic (ADR 0003): an
// incomplete enumeration can never remove an already-accepted reference.

import type { JoltSdk } from "../jolt";
import { normalizeIdentity } from "../follow";
import { store as defaultStore, type Store } from "../common/store";
import { decodeAnyReply, makeAcceptedRefPath } from "./model";
import type { ThreadEnumeration } from "./enumeration";

export async function loadThread(
  sdk: JoltSdk,
  enumeration: ThreadEnumeration,
  postAuthor: string,
  postId: string,
  store: Store = defaultStore
): Promise<void> {
  const { entries, latestSequence } = await enumeration.listAccepted(postAuthor, postId);
  const authorKey = normalizeIdentity(postAuthor);

  await Promise.all(
    entries.map(async (ref) => {
      // Fold the accepted reference (tombstone carries through as removal).
      store.upsert({
        identity: authorKey,
        path: makeAcceptedRefPath(postId, ref.replyId),
        latestSequence,
        contentId: `accepted_${ref.replyId}`,
        value: ref,
        tombstone: ref.removed === true
      });
      if (ref.removed) return;

      // Fetch the reply bytes from the replier's own namespace.
      const hit = await sdk.read(ref.replyRef, decodeAnyReply);
      if (!hit) return;
      store.upsert({
        identity: normalizeIdentity(ref.replyRef.identity),
        path: ref.replyRef.path,
        latestSequence: hit.latestSequence,
        contentId: hit.contentId,
        value: hit.value
      });
    })
  );
}
