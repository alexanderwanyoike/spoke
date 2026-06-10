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

## Design Decisions

These must be resolved before the AFK implementation phase.

### D1: How do readers discover thread manifests?

Two options:

- **By convention:** clients always try to fetch
  `/spoke/posts/{postId}/thread` for any post they render. No protocol
  support needed, but clients must know the convention and handle 404
  gracefully (no thread manifest = no replies yet).
- **Post field reference:** the post body includes a `threadManifestPath`
  or `threadManifestCid` field pointing to the manifest. Explicit but
  couples the post schema to the threading model and requires a post
  republish when the manifest is first created.

Convention is simpler and avoids republishing the post. The risk is that
clients that do not know the convention cannot discover threads. For Spoke
this is acceptable because Spoke is the only client of these schemas. For
third-party clients it would need documentation.

### D2: What happens when the post author is offline?

The manifest is the single gathering point for thread participants. If
Alice (post author) goes offline:

- Bob can still publish his reply under his own identity, but Alice cannot
  update the manifest.
- Carol, reading the thread, fetches the stale manifest and does not see
  Bob as a participant, so she never fetches Bob's reply.
- When Alice comes back online, she processes pending ingress, adds Bob to
  the manifest, and the thread becomes visible to everyone on next refresh.

This means conversations stall when the post author is unreachable. Options:

- **Accept it for v1.** The post author is the thread anchor. If they are
  offline, the thread is stale. Relay-pinned manifests and future
  store-and-forward designs address this.
- **Per-participant reply index.** Each participant publishes a local
  `/spoke/my-replies` or `/spoke/replies-by-post/{postId}` index under
  their own identity. Readers check the manifest first, then opportunistically
  check known contacts' reply indexes for posts they might have replied to.
  More resilient but more network calls and more client complexity.
- **Hybrid:** manifest for fast path, contact reply index as fallback when
  the manifest is stale or the author is unreachable.

For v1, accepting the staleness is pragmatic. The per-participant index is
a good follow-up if the offline-author problem hurts the demo.

### D3: Binary publish for image attachments

Current Spoke publishing goes through `publishJson` which sends JSON to
`/app/v1/publish` as multipart form data. Image attachments are binary blobs
that need to be published as separate content-addressed objects before the
post can reference their CIDs.

The daemon's `/app/v1/publish` endpoint already accepts arbitrary file
uploads via multipart form data. The plan is:

1. Client reads the image file as a `Blob` / `ArrayBuffer`.
2. Client calls the existing `/app/v1/publish` endpoint with the binary
   payload and a path like `/spoke/media/{mediaId}`.
3. Daemon returns the `content_id` (CID) for the uploaded binary.
4. Client constructs the post body with an attachment referencing that CID.
5. Client publishes the post JSON as normal.

No new daemon API is needed. The question is whether the media path
convention (`/spoke/media/{id}`) is the right namespace, or whether
attachments should live under the post path
(`/spoke/posts/{postId}/media/{mediaId}`). Keeping them flat under
`/spoke/media/` is simpler and avoids path depth. Nesting under the post
makes cleanup and inventory easier but means the path encodes a
relationship the daemon does not enforce.

### D4: Ingress notification shape

When Bob replies to Alice's post, he sends a notification to Alice via
ingress so Alice can update the manifest. Two shapes:

- **Full reply object:** the ingress payload is the complete `spoke.reply.v2`
  JSON that Bob already published under his own identity. Alice receives it,
  knows who replied and what they said, and can update the manifest
  immediately without fetching from Bob. Downside: larger ingress payload,
  and Alice now has a plaintext copy of Bob's reply in her ingress store.
- **Lightweight envelope:** the ingress payload is a minimal notification
  like `{ "schema": "spoke.thread-notify.v1", "postId": "...",
  "replyPath": "/spoke/replies/{postId}/{replyId}",
  "replyIdentity": "bob.jolt" }`. Alice receives it, fetches the actual
  reply from Bob's identity, then updates the manifest. Downside: requires
  Bob to be reachable for Alice to see the reply content, but the manifest
  can still be updated from the notification alone.

Full reply object is recommended for v1 because:

- replies are small (text), so payload size is not a concern;
- Alice can display Bob's reply even if Bob goes offline immediately after;
- Alice has everything she needs to update the manifest in one step.

If ingress payloads become a concern later, a lightweight envelope can be
added as an optimization.

### D5: Thread manifest content - participants only vs participants plus metadata

The manifest could include:

- **Participants only** (proposed): just the list of identities who have
  replied. Minimal, always accurate, easy to merge.
- **Participants plus reply counts**: convenient for UI ("3 replies") but
  can go stale if participants publish replies without updating the
  manifest. Requires the manifest to be a more active document.
- **Participants plus last-reply timestamps**: useful for sorting threads
  by activity, same staleness risk as reply counts.

Participants only is recommended for v1. Reply counts and activity
timestamps can be computed client-side from the assembled tree.

### D6: Auto-add contacts to manifest at publish time vs add-on-reply

When Alice publishes a post:

- **Add known contacts immediately:** all of Alice's contacts appear in the
  initial manifest. Bob and Carol can start replying right away without
  waiting for Alice to process ingress. Downside: manifests include people
  who may never reply, and the manifest grows with the contact list.
- **Add on reply only** (proposed): the manifest starts with just Alice.
  Participants are added when they send their first reply via ingress.
  Minimal manifests, but new participants cannot see other replies until
  Alice processes their ingress and updates the manifest.

Add-on-reply is recommended for v1 because it keeps manifests minimal and
avoids exposing the full contact list in every thread. The latency cost
(one round-trip before a new participant sees the full thread) is acceptable
for an eventually-consistent system.

## Notes

- This card depends on the current Jolt daemon APIs. No protocol changes are
  needed.
- The threading model assumes participants are reachable (online, or their
  content is pinned/cached). If a participant is unreachable, their replies
  are missing from the tree but other replies still render.
- The manifest is a single point of freshness: if the post author is offline,
  new participants cannot be added. D2 discusses mitigations.

## Verification

- Green: `npm test` in `/home/alexander/Code/Apps/jolt-apps/spoke`.
- Green: `npm run build` in `/home/alexander/Code/Apps/jolt-apps/spoke`.
- Green: three-node local demo where Alice publishes a post, Bob and Carol
  reply, and all three see the full thread with nested replies.
- Green: Alice publishes a post with an image attachment. Bob fetches and
  sees the image inline.
