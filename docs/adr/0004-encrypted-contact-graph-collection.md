# 0004: Contact graph as an encrypted append-record Collection

**Status:** Accepted
**Date:** 2026-06-18

## Context

The contact graph (who the local user knows, and the trust state of each
relationship) was stored as a single rewritten JSON array in `localStorage`
(`spoke.contacts`) and held in React state. This is exactly the
set-as-rewritten-blob pattern ADR 0001 exists to kill, with two extra problems:

- It never reaches Jolt, so the graph does not survive a reinstall and does not
  sync across a user's own authorized devices (the multi-writer identity model
  in jolt cards 091/094).
- It treats React state as the source of social truth, the read-side failure
  ADR 0003 closes for every other feature.

Card 103 brings messages and follows through the command/query seam, so the
contact graph has to land on Jolt. The question this ADR settles is *how* and
*how visibly*.

## Decision

The contact graph is a **Collection of append records, encrypted to self.**

- Each contact edge is its own publication at `/spoke/contacts/{identity}`
  (schema `spoke.contact.v1`: `identity`, `displayName`, `relationship`
  (`local` | `requested` | `accepted`), `updatedAt`, optional `removed`).
- The *set* is never one blob. Adding a contact is a new path (an append to the
  Collection). Changing one edge's relationship is a last-writer-wins rewrite of
  that one edge's path, which is acceptable per-edge (it is a Singleton Object
  scoped to a single contact, not the whole graph). Removing a contact is a
  **tombstone** (`removed: true`), the only way an edge leaves the Projection.
- Every record is published with `publishEncryptedJson(path, body, [self])` so
  only the user's own identity (and its authorized devices) can read it. The
  graph is private and opaque to everyone else.
- Enumeration is **local**: a user's own contact graph lives in their own node,
  so `loadContacts` lists the local node's published inventory
  (`listPublished`), filters the `/spoke/contacts/` prefix, decrypts each edge,
  and folds it into the monotonic store. This does **not** depend on card 104's
  J1 enumeration, because no remote identity is being enumerated.
- React reads the graph only through `useContacts`, a Projection over the store.
  React state is never the source of contact truth.

## Why encrypted, and why not friends-of-friends yet

In Spoke today posts, replies, and profiles are already public; DMs and the
contact list are the only private social data, and the contact list currently
never leaves the device. Publishing the graph in the clear would let anyone
traverse a user's trust relationships ("friends of friends") but is a one-way,
content-addressed, effectively permanent exposure and a silent privacy
regression from the local-only status quo.

Friends-of-friends is a genuine feature, but it requires *other* people to read
your edges, which encryption deliberately prevents. It is therefore deferred to
its own card: an explicit, opt-in **public discovery surface** (likely a
separate minimal `/spoke/follows/{identity}` edge carrying only
follower -> followee, no nicknames or relationship state), designed and recorded
on its own rather than baked into this plumbing refactor as a default.

## Consequences

- The contact graph survives reinstall and syncs across the user's own devices,
  monotonically (a stale or incomplete `listPublished` can never drop a known
  edge; only a tombstone removes one).
- `localStorage` contacts become a one-time, read-only migration source:
  existing edges are back-filled into the encrypted Collection on first load,
  then the graph is read from the store.
- The Jolt SDK seam gains encrypted publish/read primitives
  (`publishEncryptedJson`, `readEncrypted`), which the message feature reuses for
  its encrypted outgoing copies.
- Friends-of-friends is explicitly a non-goal of card 103 and a future card.
