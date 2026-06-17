// Monotonic projection store (PRIVATE to the domain layer).
//
// React never imports or subscribes to this directly; it reads through the
// query hooks in queries.ts. The store is a normalized cache of References,
// keyed by (identity, path) and versioned by Jolt's latest_sequence. Two
// invariants govern every write (see docs/adr/0003):
//   - Upsert by version, never downgrade.
//   - Reads are additive, never subtractive. A record leaves a Projection only
//     via an explicit tombstone, never because a later fetch did not return it.

import { referenceKey, type Reference } from "./jolt";

export type StoreEntry = {
  identity: string;
  path: string;
  latestSequence: number;
  contentId: string;
  value: unknown;
  // A tombstone excludes the record from Projections but is retained in the
  // store so monotonicity holds. Used by collection projections (card 091);
  // singletons like the profile never tombstone.
  tombstone?: boolean;
};

export type StoreSnapshot = ReadonlyMap<string, StoreEntry>;

export interface Store {
  // Returns true if the write changed the store (i.e. it was not a no-op
  // downgrade), false otherwise.
  upsert(entry: StoreEntry): boolean;
  get(ref: Reference): StoreEntry | undefined;
  getByPrefix(identity: string, pathPrefix: string): StoreEntry[];
  getSnapshot(): StoreSnapshot;
  subscribe(listener: () => void): () => void;
  reset(): void;
}

export function createStore(): Store {
  let entries = new Map<string, StoreEntry>();
  // The snapshot is a frozen copy that only changes when the data changes, so
  // useSyncExternalStore sees a stable reference between mutations.
  let snapshot: StoreSnapshot = entries;
  const listeners = new Set<() => void>();

  function commit() {
    snapshot = new Map(entries);
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    upsert(entry) {
      const key = referenceKey(entry);
      const existing = entries.get(key);
      if (existing && existing.latestSequence >= entry.latestSequence) {
        // Never downgrade. An equal or older sequence is a no-op.
        return false;
      }
      entries.set(key, entry);
      commit();
      return true;
    },
    get(ref) {
      return entries.get(referenceKey(ref));
    },
    getByPrefix(identity, pathPrefix) {
      const matches: StoreEntry[] = [];
      for (const entry of entries.values()) {
        if (entry.identity === identity && entry.path.startsWith(pathPrefix)) {
          matches.push(entry);
        }
      }
      return matches;
    },
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset() {
      entries = new Map();
      snapshot = entries;
    }
  };
}

// The default domain-wide store. Query hooks read it; commands write it.
export const store = createStore();
