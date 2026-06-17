# 0002: Threads are author-anchored

**Status:** Accepted
**Date:** 2026-06-17

## Context

A thread is a conversation under a post. Replies are authored under each
replier's own Jolt identity namespace (Bob's reply lives under `bob.jolt`, not
under the post author). Reading a thread is therefore a join across many
namespaces, and the hard problem is discovering the participant set.

Jolt's core invariant is identity-owned namespaces: every path is owned by
exactly one identity, there is no world-writable location, and there is no
global index. The only identity guaranteed known to every reader of a thread is
the post author. Owner-less ("fully open") threads would require either global
enumeration or a shared writable namespace; the latter means group/topic
namespaces, which are an explicit non-goal of Jolt's multi-writer design.

## Decision

Threads are anchored on the post author. The author's namespace holds the
authoritative index of the thread as append records (the accepted-reply
references). Each reply's bytes live in the replier's own namespace. The post
author is the single gatekeeper for the entire thread, including nested replies
(Carol replying to Bob's reply is still gated by the post author, not by Bob).

Read path:

1. Enumerate the author's accepted-reply records.
2. Resolve and fetch each referenced reply from its replier's namespace.
3. Assemble the tree from each reply's `parent` reference.

Acceptance policy (what admits a reply to the authoritative index):
auto-accept replies from the author's contacts, queue replies from strangers for
manual review. Expressed as a pure policy function so it is testable and
changeable without touching the data model.

## Consequences

- Thread assembly fits Jolt's identity-owned namespace invariant with no new
  protocol primitives beyond append-record enumeration.
- The author gets moderation for free.
- Liveness cost: a reply is visible to third parties only after the author's
  device processes it. The replier sees their own pending reply immediately from
  their outbox; others see it post-acceptance. This is inherent to anchoring,
  not a defect.
- If owner-less threads are ever wanted, they require group/topic namespaces in
  Jolt and would supersede this decision.
