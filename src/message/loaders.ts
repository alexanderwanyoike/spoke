// Loaders: read-path hydration for conversations. Both halves of every
// conversation live in the local node's namespace, so enumeration is local: list
// the published inventory, decrypt outgoing copies and read received copies, and
// fold each into the monotonic store. Additive + monotonic - a stale or
// incomplete listing can never drop a message the store already holds.

import type { JoltEncryptedSdk, JoltSdk } from "../jolt";
import { normalizeIdentity } from "../follow";
import { store as defaultStore, type Store } from "../common/store";
import { MESSAGES_OUTGOING_PREFIX, MESSAGES_RECEIVED_PREFIX, decodeMessage } from "./model";

export async function loadConversations(
  sdk: JoltSdk & JoltEncryptedSdk,
  localIdentity: string,
  store: Store = defaultStore
): Promise<void> {
  const owner = normalizeIdentity(localIdentity);
  const published = await sdk.listPublished().catch(() => []);
  await Promise.all(
    published.map(async (item) => {
      const path = item.path;
      if (!path) return;
      // Outgoing copies are encrypted to the recipient (decryptable by the
      // sender); received copies are plaintext in the recipient's namespace.
      const hit = path.startsWith(MESSAGES_OUTGOING_PREFIX)
        ? await sdk.readEncrypted({ identity: localIdentity, path }, decodeMessage)
        : path.startsWith(MESSAGES_RECEIVED_PREFIX)
          ? await sdk.read({ identity: localIdentity, path }, decodeMessage)
          : null;
      if (!hit) return;
      store.upsert({
        identity: owner,
        path,
        latestSequence: hit.latestSequence,
        contentId: hit.contentId,
        value: hit.value
      });
    })
  );
}
