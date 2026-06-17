// Loaders: the read-side hydration half of the seam. A loader fetches an
// existing publication from Jolt and folds it into the monotonic store; it does
// not create social truth (that is a command), and it is not a synchronous
// projection read (that is a query). It is the async fetch that feeds the cache
// the queries then select from. The monotonic merge here is the read-side
// protection from docs/adr/0003: a stale or incomplete read can never downgrade
// a newer confirmed value.

import type { JoltSdk } from "../jolt";
import { normalizeIdentity } from "../follow";
import { decodeProfile } from "./model";
import { store as defaultStore, type Store } from "../common/store";
import { PROFILE_PATH } from "./commands";
import type { SpokeProfile } from "../api";

// Read a remote (or own) profile through the SDK and fold it into the store.
// Returns the decoded profile, or null if it was missing or not a profile.
export async function loadProfile(
  sdk: JoltSdk,
  identity: string,
  store: Store = defaultStore
): Promise<SpokeProfile | null> {
  const hit = await sdk.read({ identity, path: PROFILE_PATH }, decodeProfile);
  if (!hit) {
    return null;
  }
  const profile = hit.value;
  store.upsert({
    identity: normalizeIdentity(profile.identity || identity),
    path: PROFILE_PATH,
    latestSequence: hit.latestSequence,
    contentId: hit.contentId,
    value: profile
  });
  return profile;
}
