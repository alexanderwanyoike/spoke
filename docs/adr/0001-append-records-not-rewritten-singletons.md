# 0001: Model growing data as append records, not rewritten singletons

**Status:** Accepted
**Date:** 2026-06-17

## Context

Spoke stores its social data as JSON objects published to Jolt paths. The
original model stored a thread as one manifest object that the owner rewrote on
every change ("read manifest, add reply, write whole manifest back"), and the
feed as one rewritten index object.

Jolt is moving to a true multi-writer identity model (jolt cards 091/094): one
user identity can be written by multiple authorized devices. When two devices
write the same singleton path concurrently, Jolt deterministically picks one
winner and keeps the loser only as conflict diagnostics that apps do not read.

Consequence: a rewritten set-as-one-object silently loses concurrent writes. If
Alice's laptop accepts reply B and her phone accepts reply C at the same time,
one acceptance is permanently lost from the readable state. This is the
disappearing-reply bug, made structural by multi-writer.

## Decision

Distinguish two data shapes explicitly, mirroring Jolt's own operation classes:

- **Singleton Object** - represents the current value of a path. Last writer
  wins; rewriting the whole object is correct; losing a concurrent write is
  acceptable. Used only for genuinely singular values (e.g. `/spoke/profile`).
- **Append Record** - represents one element of a growing set. Each element is
  its own object at its own path. The set is never encoded as one rewritten
  object. Concurrent appends (including from multiple devices of one user) all
  coexist.

**Rule: anything that grows is modelled as Append Records.** Posts, replies,
accepted-reply references, and messages are append records. Reading such a set
("a Collection") means enumerating its records and folding them into a
Projection, never reading one blob.

## Consequences

- The data model no longer loses writes under multi-writer Jolt.
- Reads require *enumerating* records under a path prefix. Jolt does not yet
  expose an app API for this, so it is being added (see the Jolt enumeration
  card). Until it lands, Spoke reads Collections through a temporary
  Spoke-maintained index behind a swappable seam; the index is best-effort and
  only fully correct in the single-device case.
- Spoke's read layer must merge monotonically: a newer confirmed record must
  never be removed by a later stale or incomplete read.
