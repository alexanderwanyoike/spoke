// Queries: the read half of the domain seam (CQRS). Selectors fold the store
// snapshot into finished Projections; the hooks wire those selectors to the
// store via useSyncExternalStore. Components depend only on these hooks, never
// on the store. React state caches Projections; it is never the source of
// social truth.

import { useMemo, useSyncExternalStore } from "react";
import { referenceKey } from "../jolt";
import { normalizeIdentity } from "../follow";
import { store as defaultStore, type Store, type StoreSnapshot } from "../common/store";
import { PROFILE_PATH } from "./commands";
import type { SpokeProfile } from "../api";
import type { ProfilesByIdentity } from "./model";

export function selectProfile(
  snapshot: StoreSnapshot,
  identity: string
): SpokeProfile | undefined {
  const entry = snapshot.get(
    referenceKey({ identity: normalizeIdentity(identity), path: PROFILE_PATH })
  );
  if (!entry || entry.tombstone) {
    return undefined;
  }
  return entry.value as SpokeProfile;
}

// Project every cached profile into a map keyed by normalized identity. This is
// the store-backed replacement for the old `profileCache` React state.
export function selectProfiles(snapshot: StoreSnapshot): ProfilesByIdentity {
  const profiles: ProfilesByIdentity = {};
  for (const entry of snapshot.values()) {
    if (entry.path === PROFILE_PATH && !entry.tombstone) {
      profiles[entry.identity] = entry.value as SpokeProfile;
    }
  }
  return profiles;
}

export function useProfile(identity: string, store: Store = defaultStore): SpokeProfile | undefined {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return useMemo(() => selectProfile(snapshot, identity), [snapshot, identity]);
}

export function useProfiles(store: Store = defaultStore): ProfilesByIdentity {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return useMemo(() => selectProfiles(snapshot), [snapshot]);
}
