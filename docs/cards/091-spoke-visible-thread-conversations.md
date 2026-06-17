# 091: Spoke Visible Thread Conversations

**Type:** HITL then AFK  
**Milestone:** Spoke Social Network  
**Status:** Ready next  

## Why

The current shared-thread implementation lets readers see the same accepted
flat replies under a post. It does not yet support recursive conversation:
Bob posts, Alice replies, Bob replies to Alice, Carol replies to Bob, and all
participants see the same nested tree.

It also needs to support author self-conversation: Bob can reply to Bob's own
post, and Bob can reply to Bob's own replies. Self-replies should not require
recipient ingress because Bob already owns the post/thread namespace.

Spoke needs real visible thread conversations without violating Jolt's
identity-owned namespace rule.

## Product Shape

A post thread is a shared conversation anchored by the post author's identity.
The post author owns the thread manifest. Each participant owns and signs their
own replies under their own identity. Clients assemble the tree locally from
manifest participants and reply parent references.

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
  to the thread manifest.
- For post-author self-replies, publish the reply locally and update the thread
  manifest immediately without sending ingress.
- Build a nested reply tree from `parent` references.
- Render nested replies with per-reply composers.
- Keep old `spoke.reply.v1` and current `spoke.thread.v1` replies readable
  during migration.

## Acceptance Criteria

- [ ] A new post creates or exposes a thread manifest.
- [ ] A contact can reply to the post and publish the reply under their own
      identity path.
- [ ] The post author can reply to their own post without an ingress round trip.
- [ ] The post author can reply to their own reply, producing a nested
      self-reply.
- [ ] The post author receives the reply notification and updates the manifest.
- [ ] Bob can reply to Alice's reply, and Carol can reply to Bob's reply.
- [ ] All participants can fetch the same nested conversation tree.
- [ ] Existing flat `spoke.reply.v1` and `spoke.thread.v1` content still
      renders.
- [ ] No new Jolt daemon capabilities are required.
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
