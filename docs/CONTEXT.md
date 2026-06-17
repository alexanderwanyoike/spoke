# Spoke Context

Spoke is a social application built as a replaceable view over content published
to the Jolt network. Spoke owns all social concepts (profiles, posts, replies,
threads, messages, follows). Jolt owns identity, signed publishing,
content-addressed fetch, encryption, and recipient-controlled ingress. Jolt must
never learn about posts, replies, or audiences.

## Layering

```
UI (React, thin)            knows ONLY the command + query seams. Nothing below.
  ↓
src/<feature>/              the public domain seam (CQRS), one folder per feature
  commands.ts                 mutations: create/change durable social truth on Jolt
  loaders.ts                  read-path: async fetch-from-Jolt + monotonic merge into store
  queries.ts                  projection subscription hooks + selectors (sync, pure)
  model.ts                    types + pure domain helpers / tolerant decoders
  index.ts                    barrel: the feature's only public surface
  ↓
src/common/store.ts         PRIVATE to the domain. monotonic normalized cache.
  ↓                          React never imports or subscribes to it directly.
src/jolt/ (SDK / ACL)       pure transport + protocol primitives, no social concepts
  ↓
Jolt daemon (../../jolt)    identity, publish, resolve, fetch, encrypt, ingress
```

React depends on commands (mutations) and query hooks (`useThread`, `useFeed`,
...) that return finished Projections. The store and its `useSyncExternalStore`
wiring live behind the query seam and are swappable without touching components.
`useState` is for UI-only concerns (drafts, modals, active tab), never social
truth.

### File organization

Each social feature owns a folder under `src/` (`src/profile/`, `src/feed/`,
`src/message/`, ...) bundling its `model` / `commands` / `loaders` / `queries`
and tests behind an `index.ts` barrel; consumers import only from `./<feature>`,
never a file inside it. The three seam roles are kept distinct: a **command**
creates durable social truth on Jolt; a **loader** hydrates the cache by
fetching truth that already exists and merging it monotonically (the read-side
of ADR 0003); a **query** is a synchronous, side-effect-free Projection read. Shared, non-feature infrastructure lives outside the feature
folders: the monotonic store in `src/common/`, and the Jolt SDK / ACL in
`src/jolt/`. Features are moved into this layout as their cards are worked, not
all at once.

### Marshalling lives in the ACL

The Jolt SDK owns the wire format. `publishJson(path, body)` serialises; `read`
takes a `Decoder<T>` (`(value: unknown) => T | null`), resolves, fetches,
parses, and validates, returning a `Versioned<T>` (value + `latestSequence` +
`contentId`) or `null` when the reference is missing, unreachable, or does not
decode. The domain never sees bytes: a feature's `model.ts` only supplies pure
schema-level decoders (`decodePost`, `decodeProfile`, ...), and loaders fold the
returned `value`/version straight into the store. This keeps the
tolerant-reader policy at the boundary and stops transport DTOs (raw bytes,
snake_case daemon fields) from leaking up into the domain.

## Glossary

### Singleton Object
A publication at a path that represents the *current value* of that path. Last
writer wins. Rewriting the whole object is correct, and losing a concurrent
write to conflict history is acceptable. Maps directly onto Jolt's singleton
path operation class. Spoke example: `/spoke/profile`.

### Append Record
A publication that represents *one independent element* of a growing set. Each
element is its own object at its own path; the set is never encoded as a single
rewritten object. Multiple writers (and multiple devices of one writer) can
append concurrently and all valid records coexist. Maps onto Jolt's append
operation class. Spoke examples: a post, a reply, an accepted-reply reference, a
message.

**Core data-modelling rule:** anything that *grows* is modelled as Append
Records, never as a rewritten Singleton Object. This is what makes Spoke correct
under multi-writer Jolt: a singleton set-blob silently loses concurrent writes
to deterministic-winner selection; a collection of append records does not.

### Collection
The enumerable set of Append Records that share a path prefix (e.g. all replies
to a post). Reading a Collection means enumerating its records, never reading one
blob. Enumeration is the open dependency (see [[E]] in grilling notes): Jolt does
not yet expose an app API to list append records, so a Collection is read today
through a Spoke-maintained index that must itself be monotonic.

### Projection
A read-side view model assembled by deterministically folding one or more
Collections / Singleton Objects (e.g. a feed, a thread tree, a conversation, a
profile). A Projection is derived, never authoritative. React state caches
Projections; it is never the source of social truth.

### Reference
The stable identity of a publication: `(identity, path)`, versioned by Jolt's
`latest_sequence`. The store keys everything by Reference. A Collection is every
Reference whose path matches a prefix.

### Tombstone
An Append Record that marks another record as removed (e.g. an author
un-accepting a stranger's reply). The only way a record leaves a Projection.
Tombstoned records are excluded from the Projection but retained in the store so
monotonicity holds.

### Store
The domain-private normalized cache of References. Monotonic: upsert-by-version,
never downgrade; reads are additive and never remove by absence. Not visible to
React. See ADR 0003.

### Tolerant readers, strict writers
The compatibility policy (card 099). Every object fetched from Jolt is treated as
`unknown` until decoded and normalized into a current canonical model. Readers
accept all supported historical schema versions and skip unrecoverable objects
with non-blocking diagnostics, so one malformed object cannot poison a
Projection. Writers publish only the newest schema version. No in-place
migration of already-published data.

### Source of truth
Durable signed publications on Jolt. React state is a disposable cache of
Projections built from those publications. A stale or incomplete read must never
overwrite a newer confirmed result (monotonic merge).
