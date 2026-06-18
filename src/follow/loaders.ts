// Loaders: read-path hydration for the contact graph. A user's own graph lives
// in their node, so enumeration is local (ADR 0004): list the published
// inventory, decrypt each /spoke/contacts/ edge, and fold it into the store. The
// merge is additive and monotonic - a stale or incomplete listing can never drop
// a known edge; only a tombstone removes one.

import type { JoltEncryptedSdk } from "../jolt";
import { store as defaultStore, type Store } from "../common/store";
import { CONTACTS_PREFIX, decodeContact, normalizeIdentity } from "./model";

export async function loadContacts(
  sdk: JoltEncryptedSdk,
  localIdentity: string,
  store: Store = defaultStore
): Promise<void> {
  const owner = normalizeIdentity(localIdentity);
  const published = await sdk.listPublished().catch(() => []);
  await Promise.all(
    published
      .filter((item) => item.path?.startsWith(CONTACTS_PREFIX))
      .map(async (item) => {
        const path = item.path as string;
        const hit = await sdk.readEncrypted({ identity: localIdentity, path }, decodeContact);
        if (!hit) return; // missing, unreachable, or not a contact record
        store.upsert({
          identity: owner,
          path,
          latestSequence: hit.latestSequence,
          contentId: hit.contentId,
          value: hit.value,
          tombstone: hit.value.removed === true
        });
      })
  );
}
