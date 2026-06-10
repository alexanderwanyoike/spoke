# 091: Spoke Visible Thread Conversations

**Type:** HITL then AFK
**Milestone:** Post-v0 Social
**Status:** Designed in PR
**Blocked by:** None

## Why

Spoke replies currently use encrypted recipient ingress: Bob replies to
Alice, and only Alice can see Bob's reply. Carol cannot see Bob's reply, Bob
cannot see Carol's reply, and nobody can reply to another person's reply.
This makes Spoke conversations feel broken because threads are private
point-to-point tunnels instead of shared conversations under a post.

The core social loop needs:

- all participants in a post thread can see each other's replies;
- replies are nested (a user can reply to another user's reply);
- the threading model works with Jolt's identity-owned paths and
  content-addressed storage;
- rich posts with images, videos, and hyperlinks.

## Product Bet

A post thread is a shared conversation anchored by the post author's identity.
The post author maintains a thread manifest that lists all participants. Each
participant publishes their own replies under their own identity. Clients
assemble the tree locally.

This preserves Jolt's identity-ownership property: nobody writes to another
identity's namespace. The post author owns the manifest (gathering point), and
each person owns and signs their own replies.

## Threading Model

### New paths

```text
/spoke/posts/{postId}/thread       Thread manifest (published by post author)
/spoke/replies/{postId}/{replyId}  Individual reply (published by replier)
```

### Thread manifest

The post author publishes a signed manifest at
`/spoke/posts/{postId}/thread`:

```json
{
  "schema": "spoke.thread.v1",
  "postId": "post_abc123",
  "participants": [
    { "identity": "alice.jolt", "addedAt": "2026-06-10T12:00:00Z" },
    { "identity": "bob.jolt", "addedAt": "2026-06-10T12:05:00Z" }
  ],
  "updatedAt": "2026-06-10T12:05:00Z"
}
```

The manifest is the gathering point. Anyone who can fetch the post can fetch
the manifest and discover all participants.

### Distributed replies

Each participant publishes their replies under their own identity:

```json
{
  "schema": "spoke.reply.v2",
  "id": "reply_def456",
  "postId": "post_abc123",
  "parent": "post_abc123",
  "author": "bob.jolt",
  "body": "Great post",
  "createdAt": "2026-06-10T12:05:00Z"
}
```

Nested reply to another reply:

```json
{
  "schema": "spoke.reply.v2",
  "id": "reply_ghi789",
  "postId": "post_abc123",
  "parent": "bob.jolt:/spoke/replies/post_abc123/reply_def456",
  "author": "carol.jolt",
  "body": "I agree with Bob",
  "createdAt": "2026-06-10T12:10:00Z"
}
```

The `parent` field is either the post ID (top-level reply) or a full
`identity:/path` reference to another reply. The tree is unbounded because
each reply is an independent signed object.

### Thread assembly (client-side)

1. Fetch the post at `/spoke/posts/{postId}`.
2. Fetch the thread manifest at `/spoke/posts/{postId}/thread`.
3. For each participant in the manifest, resolve their identity and fetch
   their replies under `/spoke/replies/{postId}/*`.
4. Build the tree locally using `parent` references.
5. Render nested.

### Manifest lifecycle

- When a post is created, the author publishes an initial manifest with
  themselves as the only participant.
- When a new person replies (via ingress or direct publish), the post author
  receives the reply and adds the replier to the manifest.
- The manifest is re-published under the post author's identity so it stays
  signed and content-addressed.
- Known-contact auto-accept extends to manifest updates: replies from known
  contacts are added to the manifest automatically.

### Reply delivery

Two paths:

1. **Direct publish:** If the replier can fetch the post author's identity
   and reachability, they send the reply via ingress. The post author opens
   the ingress, publishes the reply under their own `/spoke/replies/{postId}/`
   namespace, and updates the manifest.
2. **Self-publish:** The replier publishes the reply under their own identity
   at `/spoke/replies/{postId}/{replyId}` and sends a notification to the post
   author via ingress. The post author adds them to the manifest. Other
   participants discover the new reply by re-fetching the manifest and the
   new participant's reply objects.

Path 2 is the target model because it preserves identity ownership: each
person's replies live under their own namespace. Path 1 is a simpler fallback
that concentrates replies under the post author but loses the p2p distribution
property.

This card should implement path 2.

## Rich Posts

Extend `spoke.post.v1` to support rich content:

```json
{
  "schema": "spoke.post.v2",
  "id": "post_abc123",
  "author": "alice.jolt",
  "displayName": "Alice",
  "title": "My post",
  "body": "Check this out!",
  "attachments": [
    {
      "type": "image",
      "contentId": "Qm...",
      "alt": "A photo of something cool",
      "mimeType": "image/jpeg"
    },
    {
      "type": "link",
      "url": "https://example.com/article",
      "title": "Related article",
      "description": "A longer description"
    }
  ],
  "createdAt": "2026-06-10T12:00:00Z",
  "path": "/spoke/posts/post_abc123"
}
```

Image and video attachments are published as separate content-addressed
objects first, then referenced by CID in the post body. The client fetches
the binary blob by CID and renders it inline.

For v1 of this card, attachments are optional and the UI should degrade
gracefully when attachment CIDs are unreachable (show alt text or a
placeholder).

## New Schemas

```text
spoke.thread.v1   Thread manifest listing participants
spoke.reply.v2    Reply with parent reference for nesting
spoke.post.v2     Post with optional attachments
```

The feed index schema (`spoke.feed.v1`) stays the same. Feed entries already
include `contentId` so readers can fetch posts directly.

## New Paths

```text
/spoke/posts/{postId}/thread              Thread manifest
/spoke/replies/{postId}/{replyId}         Reply published by replier
/spoke/posts/{postId}                     Updated to v2 schema
/spoke/feed                               No change
/spoke/profile                            No change
/spoke/outgoing/{id}                      Kept for backward compat during migration
```

## Capabilities

No new capabilities needed. The existing Spoke capabilities already cover:

- `publish:/spoke/*` for thread manifests, replies, and post updates;
- `publish:encrypted:/spoke/*` for encrypted ingress replies during
  migration;
- `resolve:public` and `fetch:public` for fetching other participants'
  replies;
- `ingress:send`, `ingress:read`, `ingress:decide` for reply delivery.

## What to Build

### Data layer

- Add `spoke.thread.v1`, `spoke.reply.v2`, `spoke.post.v2` types to `api.ts`.
- Add thread manifest publish/fetch helpers.
- Add reply publish under replier's own identity.
- Add thread assembly logic that fetches manifest, resolves participants,
  and fetches their reply objects.
- Add tree builder that walks `parent` references into a nested structure.

### Reply flow

- When replying to a post, publish the reply under the replier's own
  `/spoke/replies/{postId}/{replyId}` path.
- Send a lightweight notification to the post author via ingress so the
  author updates the manifest.
- The notification can be a `spoke.reply.v2` object sent encrypted through
  existing ingress, or a minimal `spoke.thread-notify.v1` envelope that just
  says "new reply under {postId} from {identity}".
- On the post author's side: receive the ingress, add the new participant to
  the manifest if not already present, re-publish the manifest.

### Feed display

- Replace the flat reply list under each post with a nested thread view.
- Each reply shows author identity/display name, timestamp, and body.
- Indent replies based on nesting depth.
- Reply composer targets a specific parent (post or reply).

### Rich posts

- Add attachment support to post composer (image upload, link attachment).
- Publish binary attachments as separate content objects.
- Reference attachment CIDs in the post body.
- Render attachments inline in the feed view.

### Backward compatibility

- `spoke.reply.v1` replies (existing encrypted ingress replies) should still
  render in the thread view. Map them to the v2 structure client-side.
- Old `/spoke/outgoing/{id}` and `/spoke/replies/{id}` paths should still be
  readable.
- The feed index does not change.

## Acceptance Criteria

- [ ] A user can publish a post and the initial thread manifest is created.
- [ ] A contact can reply to the post. The reply is published under the
      contact's own identity path.
- [ ] The post author receives a notification and updates the thread manifest.
- [ ] All thread participants can see all other participants' replies.
- [ ] Replies can be nested: a user can reply to another user's reply.
- [ ] The thread view renders replies as a nested tree, not a flat list.
- [ ] Old `spoke.reply.v1` replies still appear in the thread view.
- [ ] Posts can include image attachments that render inline.
- [ ] Posts can include link attachments that render as cards.
- [ ] The feed index schema does not change.
- [ ] No new Jolt daemon capabilities are required.
- [ ] A three-node local demo (Alice, Bob, Carol) shows all three users
      seeing each other's replies on a shared post.

## Non-Goals

- Global search or discovery of threads.
- Moderation or blocking within threads.
- Editing or deleting replies after publish.
- Real-time subscriptions (thread state is still polled).
- Video attachments (image and link only for this card).
- Direct messaging or friend requests (separate card).
- Changing the Jolt daemon app API boundary.

## Open Questions

- Should the ingress notification be the full reply object or a lightweight
  envelope? Full reply means the post author can republish it if the replier
  goes offline. Lightweight means less ingress bandwidth but less redundancy.
- Should the thread manifest include reply counts or just participant lists?
  Counts are convenient but can go stale. Starting with participants only.
- Should the post author automatically add all known contacts to the manifest
  at publish time, or only add participants when they actually reply?
  Starting with add-on-reply to keep manifests minimal.

## Notes

- This card depends on the current Jolt daemon APIs. No protocol changes are
  needed.
- The threading model assumes participants are reachable (online, or their
  content is pinned/cached). If a participant is unreachable, their replies
  are missing from the tree but other replies still render.
- The manifest is a single point of freshness: if the post author is offline,
  new participants cannot be added. This is acceptable for v1 and can be
  improved later with relay-pinned manifests.

## Verification

- Green: `npm test` in `/home/alexander/Code/Apps/jolt-apps/spoke`.
- Green: `npm run build` in `/home/alexander/Code/Apps/jolt-apps/spoke`.
- Green: three-node local demo where Alice publishes a post, Bob and Carol
  reply, and all three see the full thread with nested replies.
- Green: Alice publishes a post with an image attachment. Bob fetches and
  sees the image inline.
