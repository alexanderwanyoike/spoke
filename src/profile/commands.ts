// Commands: the write half of the domain seam (CQRS). A command publishes
// through the Jolt SDK and folds the confirmed result into the monotonic store.
// Components call commands; they never touch the store or the SDK directly.

import type { JoltSdk } from "../jolt";
import { normalizeIdentity } from "../follow";
import { store as defaultStore, type Store } from "../common/store";
import type { SpokeProfile } from "./model";

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
