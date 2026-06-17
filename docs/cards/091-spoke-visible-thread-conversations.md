# 091: Spoke Visible Thread Conversations

**Type:** HITL then AFK  
**Milestone:** Spoke Social Network  
**Status:** Ready next  

## Why

The current shared-thread implementation lets readers see the same accepted
flat replies under a post. It does not yet support recursive conversation:
Bob posts, Alice replies, Bob replies to Alice, Carol replies to Bob, and all
participants see the same nested tree.

It also needs to support author self-conversation and participant recursion:
Bob can reply to Bob's own post, Bob can reply to Bob's own replies, and Alice
or Carol can reply to the post or any visible reply at any point. Self-replies
should not require recipient ingress because Bob already owns the post/thread
namespace.

Spoke needs real visible thread conversations without violating Jolt's
identity-owned namespace rule.

## Product Shape

A post thread is a shared conversation anchored by the post author's identity.
The post author owns the thread manifest. Each participant owns and signs their
own replies under their own identity. The post author's manifest records
accepted reply references so clients can discover reply IDs without remote path
listing. Clients assemble the tree locally from accepted manifest references
and reply parent references.

## Proposed Schemas

Thread manifest:

```json
{
  "schema": "spoke.thread.v2",
  "postId": "post_abc123",
  "owner": "alice.jolt",
  "participants": [
    { "identity": "alice.jolt", "addedAt": "2026-06-10T12:00:00Z" },
    { "identity": "bob.jolt", "addedAt": "2026-06-10T12:05:00Z" }
  ],
  "replies": [
    {
      "id": "reply_def456",
      "author": "bob.jolt",
      "address": "bob.jolt:/spoke/replies/post_abc123/reply_def456",
      "contentId": "bafy...",
      "createdAt": "2026-06-10T12:05:00Z",
      "moderation": "accepted"
    }
  ],
  "updatedAt": "2026-06-10T12:05:00Z"
}
```

Participant-owned reply:

```json
{
  "schema": "spoke.reply.v2",
  "id": "reply_def456",
  "postId": "post_abc123",
  "postAuthor": "alice.jolt",
  "parent": "post_abc123",
  "author": "bob.jolt",
  "body": "Great post",
  "createdAt": "2026-06-10T12:05:00Z"
}
```

Nested reply:

```json
{
  "schema": "spoke.reply.v2",
  "id": "reply_ghi789",
  "postId": "post_abc123",
  "postAuthor": "alice.jolt",
  "parent": "bob.jolt:/spoke/replies/post_abc123/reply_def456",
  "author": "carol.jolt",
  "body": "I agree with Bob",
  "createdAt": "2026-06-10T12:10:00Z"
}
```

## What to Build

- Publish an initial thread manifest for each new post.
- Publish replies under the replier's own identity path:
  `/spoke/replies/{postId}/{replyId}`.
- Send the post author an ingress notification so they can add the participant
  and accepted reply reference to the thread manifest.
- For post-author self-replies, publish the reply locally and update the thread
  manifest immediately without sending ingress.
- Build a nested reply tree from `parent` references.
- Render nested replies with per-reply composers so any participant can reply to
  the post or any visible reply.
- Keep old `spoke.reply.v1` and current `spoke.thread.v1` replies readable
  during migration.

## Acceptance Criteria

- [x] A new post creates or exposes a thread manifest.
- [x] A contact can reply to the post and publish the reply under their own
      identity path.
- [x] The post author can reply to their own post without an ingress round trip.
- [x] The post author can reply to their own reply, producing a nested
      self-reply.
- [x] The post author receives the reply notification and updates the manifest.
- [x] Alice and Carol can reply to the post at any point.
- [x] Alice and Carol can reply to any visible reply at any point.
- [x] Bob can reply to Alice's reply, and Carol can reply to Bob's reply.
- [x] All participants can fetch the same nested conversation tree.
- [x] Existing flat `spoke.reply.v1` and `spoke.thread.v1` content still
      renders.
- [x] No new Jolt daemon capabilities are required.
- [ ] A Bob/Alice/Carol demo shows recursive replies propagating.

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
