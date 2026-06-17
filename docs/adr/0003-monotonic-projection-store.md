# 0003: Monotonic projection store with tombstones

**Status:** Accepted
**Date:** 2026-06-17

## Context

The previous implementation treated React state as the source of social truth.
A background refresh rebuilt a thread's replies and called
`setRepliesByPost(wholeNewSet)`. If that refresh fetched an incomplete or stale
view, the wholesale replacement erased confirmed replies. This is the
disappearing-reply bug on the read side (the data-model side is addressed by
ADR 0001).

## Decision

Introduce a normalized cache (`store.ts`) that is private to the domain layer.
React never imports or subscribes to it; it reads through query hooks that
return Projections.

Store entries are keyed by their **reference** `(identity, path)` and versioned
by Jolt's `latest_sequence` (with `content_id` as value identity). Two
invariants govern all writes into the store:

- **Upsert by version, never downgrade.** Writing a reference keeps whichever
  value has the higher `latest_sequence`. A read returning an older sequence is
  a no-op.
- **Reads are additive, never subtractive.** A collection read adds or refreshes
  the records it observed and never removes a record merely because a later
  fetch did not return it. Removal happens only via an explicit **tombstone**
  record.

A collection is not a stored blob; it is every entry whose key matches a path
prefix. There is therefore no code path that removes a record except a
tombstone, so "stale refetch eats a record" cannot be written by accident.

Tombstones are included from v0 (not deferred) because moderation - the post
author un-accepting a stranger's reply - is a removal, and a purely grow-only
store cannot express it.

## Consequences

- The disappearing-reply bug becomes structurally impossible on the read side.
- React state returns to UI-only concerns (drafts, modals, active tab).
- The store is swappable (e.g. for a normalized-cache library later) without
  touching components, because it sits behind the query seam.
- Tombstones must be reconciled in projection folds (a tombstoned record is
  excluded from the Projection but retained in the store for monotonicity).
