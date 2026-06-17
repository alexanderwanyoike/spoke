# 091: Spoke Visible Thread Conversations

**Type:** HITL then AFK  
**Milestone:** Spoke Social Network  
**Status:** In progress (rewritten to the append model)  

> Rewritten from the original thread-manifest design to the append-record,
> author-anchored model. See `docs/adr/0002` (author-anchored threads),
> `docs/adr/0001` (append records), `docs/adr/0003` (monotonic store), and the
> epic reconciliation note in `docs/cards/100-...-epic.md`. The earlier
> "thread manifest + participants" schema is superseded.

## Why

The original shared-thread implementation stored a thread as one manifest the
post author rewrote on every change. Under multi-writer Jolt that silently
loses concurrent acceptances (the disappearing-reply bug, ADR 0001). It also
only supported flat replies, not recursive conversation: Bob posts, Alice
replies, Bob replies to Alice, Carol replies to Bob, and everyone sees the same
nested tree.

Spoke needs real visible thread conversations that fit Jolt's identity-owned
namespace rule and never lose an accepted reply.

## Product Shape (author-anchored, append-only)

A thread is anchored on the **post author**. Two distinct collections, no
rewritten manifest:

- **Replies** are Append Records under **the replier's own identity**, at
  `/spoke/replies/{postId}/{replyId}`. Each reply carries `parent` (the post or
  another reply) and `postAuthor` (the thread anchor). The replier sees their
  own pending reply immediately from their outbox.
- **Accepted-reply references** are an Append-Record **Collection owned by the
  post author**, at `/spoke/accepted/{postId}/{replyId}`. Each is a small record
  pointing at where the reply bytes live `(replierIdentity, replyPath)`. This is
  the authoritative thread index; it is enumerated, never read as one blob.

The post author is the **sole gatekeeper** for the whole thread, including
nested replies (Carol replying to Bob's reply is still gated by the post
author, not Bob). Acceptance is a pure policy: **auto-accept replies from the
author's contacts, queue replies from strangers for manual review**.
Un-accepting publishes a **tombstone** (the accepted-ref record carries
`removed: true`); the monotonic store keeps it for monotonicity but the
Projection excludes it.

Reading a thread: enumerate the author's accepted-reply references, resolve and
fetch each referenced reply from its replier's namespace, fold everything into
the monotonic store, and assemble the nested tree from each reply's `parent`.

## Schemas

Participant-owned reply (`/spoke/replies/{postId}/{replyId}` in the replier's
namespace):

```json
{
  "schema": "spoke.reply.v2",
  "id": "reply_def456",
  "postId": "post_abc123",
  "postAuthor": "alice.jolt",
  "parent": "post_abc123",
  "sender": "bob.jolt",
  "body": "Great post",
  "createdAt": "2026-06-10T12:05:00Z"
}
```

`parent` is `postId` for a top-level reply, or another reply's `id` for a nested
reply (all replies in a thread share `postId`, so an id is enough to assemble
the tree). `sender` is the reply author.

Accepted-reply reference (`/spoke/accepted/{postId}/{replyId}` in the post
author's namespace):

```json
{
  "schema": "spoke.accepted_reply.v1",
  "postId": "post_abc123",
  "replyId": "reply_def456",
  "replyRef": { "identity": "bob.jolt", "path": "/spoke/replies/post_abc123/reply_def456" },
  "acceptedAt": "2026-06-10T12:06:00Z",
  "removed": false
}
```

## What to Build

- `src/thread/` feature folder (model / policy / enumeration / commands /
  loaders / queries / index), same shape as `feed`.
- `submitReply`: publish a `spoke.reply.v2` Append Record under the replier and
  notify the post author by encrypted ingress.
- `acceptReply` (author side): publish an accepted-reply reference; auto for
  contacts, manual for strangers; driven by a pure `acceptanceDecision` policy.
- `unacceptReply`: publish the accepted-ref with `removed: true` (tombstone).
- `loadThread`: enumerate accepted references, fetch the replies, fold into the
  store (additive + monotonic).
- `selectThread` / `useThread`: assemble the nested tree from `parent`,
  excluding tombstoned references.
- Legacy `spoke.reply.v1` and `spoke.thread.v1` normalize into the same
  Projection, read-only.
- Enumeration uses the bridge (a Spoke-maintained accepted-index), swappable for
  J1 append-record enumeration in card 104.

## Acceptance Criteria

- [ ] A non-owner's reply returns "submitted" and does NOT enter the accepted
      Projection until the author accepts it.
- [ ] The post author accepting an incoming reply adds its reference to the
      accepted Collection (auto for contacts, manual for strangers).
- [ ] `loadThread` builds the nested tree from `parent` references.
- [ ] A stale or incomplete refresh cannot remove an already-accepted reference.
- [ ] Bob can reply to Alice's reply, and Carol can reply to Bob's reply; all
      participants assemble the same nested tree from public data.
- [ ] Existing flat `spoke.reply.v1` / `spoke.thread.v1` content still renders.
- [ ] No new Jolt daemon capabilities are required.

## Non-Goals

- Group chat.
- Global thread discovery.
- Ranking.
- Editing or deleting replies.
- Real-time subscriptions.
- Video/large-media protocol work.

## Protocol Boundary

This remains Spoke app state. Jolt provides identity-owned publishing,
content-addressed fetch, encrypted ingress, and app capabilities. Jolt should
not learn about posts, replies, comments, moderation, or audiences.

