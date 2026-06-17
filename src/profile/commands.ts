// Commands: the write half of the domain seam (CQRS). A command publishes
// through the Jolt SDK and folds the confirmed result into the monotonic store.
// Components call commands; they never touch the store or the SDK directly.

import type { JoltSdk } from "../jolt";
import { normalizeIdentity } from "../follow";
import { decodeProfile } from "./model";
import { store as defaultStore, type Store } from "../common/store";
import type { SpokeProfile } from "../api";

export const PROFILE_PATH = "/spoke/profile";

// Publish the local user's profile (a Singleton Object) and reflect it in the
// store. A publish is the freshest value by causality, so it always wins over
// whatever an earlier read cached, even when the daemon does not echo a
// sequence on the publish response.
export async function publishProfile(
  sdk: JoltSdk,
  profile: SpokeProfile,
  store: Store = defaultStore
): Promise<SpokeProfile> {
  const result = await sdk.publishJson(PROFILE_PATH, profile);
  const identity = normalizeIdentity(profile.identity);
  const existing = store.get({ identity, path: PROFILE_PATH });
  const latestSequence = Math.max(result.latestSequence, (existing?.latestSequence ?? -1) + 1);
  store.upsert({
    identity,
    path: PROFILE_PATH,
    latestSequence,
    contentId: result.contentId,
    value: profile
  });
  return profile;
}

// Read a remote (or own) profile through the SDK and fold it into the store.
// Returns the decoded profile, or null if it was missing or not a profile.
// A stale read can never downgrade a newer cached profile (store is monotonic).
export async function loadProfile(
  sdk: JoltSdk,
  identity: string,
  store: Store = defaultStore
): Promise<SpokeProfile | null> {
  const read = await sdk.read({ identity, path: PROFILE_PATH });
  const profile = decodeProfile(read.bytes);
  if (!profile) {
    return null;
  }
  store.upsert({
    identity: normalizeIdentity(profile.identity || identity),
    path: PROFILE_PATH,
    latestSequence: read.latestSequence,
    contentId: read.contentId,
    value: profile
  });
  return profile;
}
