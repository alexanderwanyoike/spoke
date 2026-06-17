# 100: Spoke Architecture Refactor (Epic / Tracker)

**Type:** Epic (tracks child cards)
**Milestone:** Spoke Social Network
**Status:** In progress

> This is the durable plan. It is written to survive context-clears. If you are
> a fresh session, read this file, then `docs/CONTEXT.md`, then
> `docs/adr/0001..0003`, before touching code. Do not start from the old
> `App.tsx` patterns.

## The problem

`App.tsx` (~3,200 lines, 45 `useState`, 20 `useEffect`) is the protocol handler,
ingress processor, manifest updater, feed loader, projection cache, and renderer
all at once. `api.ts` mixes raw Jolt transport with Spoke domain types, so there
is no SDK seam. The result is the disappearing-reply bug: a stale or incomplete
read overwrites a newer confirmed write, because React state is treated as the
source of social truth.

Jolt is also moving to **multi-writer identity** (jolt cards 091/094): one
identity, many authorized devices. Concurrent writes to a singleton path keep a
deterministic winner and silently drop the loser. This makes any
set-as-rewritten-blob lossy at the data layer, not just the cache layer.

## The design (decisions are recorded; do not relitigate without an ADR)

- `docs/CONTEXT.md` - layering + glossary (Singleton Object, Append Record,
  Collection, Projection, Reference, Tombstone, Store, tolerant readers/strict
  writers).
- `docs/adr/0001` - growing data = Append Records, never rewritten singletons.
- `docs/adr/0002` - threads are author-anchored; post author is sole gatekeeper;
  auto-accept from contacts, manual review for strangers.
- `docs/adr/0003` - domain-private monotonic projection store with tombstones.

Architecture:

```
Components            know ONLY the command + query seams
  ↓
queries.ts / commands.ts   public domain seam (CQRS): mutations + projection hooks
  ↓
store.ts (PRIVATE)    monotonic normalized cache, useSyncExternalStore lives here
  ↓
src/jolt/ (SDK / ACL) pure transport + protocol primitives, no social concepts
  ↓
Jolt daemon
```

Mutations → Publications. Queries → Projections. React caches Projections; it is
never the source of social truth.

## Cards (vertical tracer slices, smallest first)

| Card | Title | Track | Status | Depends on | PR |
|------|-------|-------|--------|------------|----|
| J1   | Jolt: append-record enumeration + append publish | jolt repo | in review | — | jolt #155 |
| 101  | Spoke: Jolt SDK seam + monotonic store (profile tracer) | spoke | in progress | — | — |
| 102  | Spoke: feed vertical | spoke | not started | 101 | — |
| 091  | Spoke: visible thread conversations (REWRITE to append model) | spoke | needs rewrite | 101 | — |
| 103  | Spoke: messages + follows vertical | spoke | not started | 101 | — |
| 104  | Spoke: swap bridge enumeration → J1 door | spoke | not started | J1, 102, 091 | — |
| 099  | Spoke: compatibility boundary (tolerant readers/strict writers) | spoke | exists on `codex/spoke-compatibility-boundary-card`, NOT on `dev` | — | #22 |

Update the Status column and PR column as each card lands. This table is the
single source of truth for "where are we."

## Reconciliation items

- **099 is not on `dev`.** It was merged (PR #22) into
  `codex/spoke-thread-v2-model`, not `dev`. Bring it onto the working branch and
  apply the model edit below before relying on it.
- **099 edit:** its decoder list names a "thread manifest" decoder. In this
  model the manifest is gone; replace that with an **accepted-reference
  Collection** decoder. New replies decode as `spoke.reply.v2` (parent +
  postAuthor); legacy `spoke.reply.v1` / `spoke.thread.v1` remain read-only and
  normalize into the same Projection.

## Per-card detail

### J1 (jolt repo) - append-record enumeration + append publish
- **Goal:** expose the append-record map the merge engine already builds
  (`device_writer_log.rs` `append_records: BTreeMap<path, Vec<entry>>`) over the
  app API, filtered by `(identity, path-prefix)`, plus an append publish mode.
- **Why small:** the deterministic append merge already exists and is tested in
  core. This is API surface only, not a new subsystem.
- **Done when:** an app can publish an append record under a path, and can list
  a remote identity's append records under a prefix via the app API.
- **Implemented** in jolt branch `codex/device-writer-append-app-api` (slice of
  jolt card 094, off `dev`):
  - `POST /app/v1/append` (multipart file+path, capability `publish:<path>`,
    local identity) publishes a device-writer Append entry; it never writes the
    last-writer-wins update log, so append records coexist.
  - `POST /app/v1/enumerate` (`{ identity, path_prefix }`, capability
    `resolve:public`) returns `[{ path, content_id, device_id, device_sequence,
    created_at, entry_hash }]` for the prefix.
  - Enumeration reads cached merged device-writer state (same boundary as
    resolve). Live remote-identity device-writer sync is still a 094 follow-up;
    until then the daemon must already hold the target's merged state.
  - Spoke's SDK seam (card 101) should wrap these two routes as the
    append-publish + Collection-read primitives behind `EnumerationSource`.

### 101 - Jolt SDK seam + monotonic store (profile tracer)
- **Goal:** establish the seam. Create `src/jolt/` (pure transport ACL, strip
  Spoke domain types out of `api.ts`), the private monotonic `store.ts`, and
  `Reference` types. Prove end-to-end by routing the **profile** (simplest
  singleton) through commands → store → query hook.
- **Tests:** store upsert-by-version never downgrades; read is additive;
  `publishProfile` command; `useProfile` query reads from store; SDK adapter
  fakeable.
- **Done when:** profile read/write goes through the new seam and the
  corresponding slice of `App.tsx` is deleted.

### 102 - feed vertical
- **Goal:** posts + feed Projection through commands/queries/store using the
  **bridge** enumeration (a Spoke-maintained monotonic index, swappable for J1
  later). Tracer #2.
- **Tests:** publishPost command; feed projection folds post records; stale feed
  refetch cannot drop a known post (monotonic).
- **Done when:** feed read/write goes through the seam; `App.tsx` feed code
  removed.

### 091 - visible thread conversations (rewritten implementation = S3)
- **Goal:** the hard vertical. Replies as Append Records under the replier's
  identity; accepted-reply references as an Append-Record Collection owned by
  the post author; author-anchored acceptance (auto-accept contacts, manual
  strangers); nested-tree Projection from `parent` refs; tombstones for
  un-accept. Rewrite card 091's body to this model first, then implement.
- **Required tests (from handoff):**
  - non-owner reply returns submitted and does NOT enter the accepted Projection
  - owner accepts incoming reply → accepted Collection contains the reference
  - `loadThread` builds the nested tree from references
  - stale/incomplete refresh cannot remove an already-accepted reference
- **Done when:** Bob/Alice/Carol recursive replies propagate and assemble the
  same tree; legacy v1 replies still render.

### 103 - messages + follows vertical
- **Goal:** conversations and follow requests through the new layers.
- **Done when:** message/follow read/write go through the seam; remaining
  protocol code leaves `App.tsx`.

### 104 - swap bridge enumeration → J1 door
- **Goal:** replace the bridge enumeration implementation with the J1-backed
  one. One-file change behind the `EnumerationSource` seam.
- **Done when:** Collections read via Jolt's enumeration API; bridge removed.

## How to resume in a fresh context

1. Read this file's Cards table for current status.
2. Read `docs/CONTEXT.md` and `docs/adr/0001..0003`.
3. Pick the next `not started`/`in progress` card whose deps are done.
4. TDD is required (see `AGENTS.md`). Write the failing test at the
   command/query seam first.
5. One card = one PR. Update the table Status + PR when done.
