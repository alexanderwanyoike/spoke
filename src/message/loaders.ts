// Loaders: read-path hydration for conversations. Both halves of every
// conversation live in the local node's namespace, so enumeration is local: list
// the published inventory, decrypt outgoing copies and read received copies, and
// fold each into the monotonic store. Additive + monotonic - a stale or
// incomplete listing can never drop a message the store already holds.

import type { JoltEncryptedSdk, JoltSdk } from "../jolt";
import { normalizeIdentity } from "../follow";
import { store as defaultStore, type Store, type StoreEntry } from "../common/store";
import { MESSAGES_OUTGOING_PREFIX, MESSAGES_RECEIVED_PREFIX, decodeMessage } from "./model";

type PublishedItem = Awaited<ReturnType<JoltEncryptedSdk["listPublished"]>>[number];

// A message copy is immutable, one message per path, so a held path is loaded
// unless the listing proves a newer version.
function alreadyLoaded(existing: StoreEntry | undefined, item: PublishedItem): boolean {
  if (!existing) return false;
  if (item.local_sequence != null) return existing.latestSequence >= item.local_sequence;
  return true;
}

export type ConversationLoaderSdk = Pick<JoltSdk, "read"> &
  Pick<JoltEncryptedSdk, "listPublished" | "readEncrypted">;

export async function loadConversations(
  sdk: ConversationLoaderSdk,
  localIdentity: string,
  store: Store = defaultStore
): Promise<void> {
  const owner = normalizeIdentity(localIdentity);
  const published = await sdk.listPublished().catch(() => []);
  await Promise.all(
    published.map(async (item) => {
      const path = item.path;
      if (!path) return;
      // This runs on a short poll, and every read of an outgoing copy is a
      // decryption. Skip anything the store already holds at this version so an
      // unchanged inventory costs one listing and nothing else.
      if (alreadyLoaded(store.get({ identity: owner, path }), item)) return;
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
