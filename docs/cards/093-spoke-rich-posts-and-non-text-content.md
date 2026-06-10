# 093: Spoke Rich Posts and Non-Text Content

**Type:** HITL then AFK
**Milestone:** Post-v0 Social
**Status:** Designed in PR
**Blocked by:** None
**Related:** 091, 092

## Why

Spoke posts are currently plain text: a title and a body string. Real social
posts need images, embedded links, and eventually videos. This is also where
the harder Jolt question surfaces: how does the network handle non-text
content efficiently? Binary blobs are larger, slower to transfer, and more
expensive to cache than JSON. This card addresses both the Spoke UX and the
Jolt-level questions that come with it.

## The Jolt Non-Text Content Question

Jolt's current content model is content-addressed binary blobs. The daemon
already accepts arbitrary file uploads via multipart publish and returns a
CID. Content-addressing itself is format-agnostic: a CID does not care
whether the bytes are JSON, a JPEG, or an MP4.

The real questions are:

1. **Size:** what is reasonable for a p2p content-addressed network? A 50 KB
   JPEG is fine. A 500 MB video is not, at least not without streaming or
   chunked transfer. The daemon does not currently enforce size limits on
   publish, but large objects will be slow to transfer, cache, and pin.

2. **Discovery:** how does a client know what type of content a CID
   represents? The CID itself is opaque. Currently the publishing client
   knows the type because it uploaded the bytes. But a fetching client only
   has the CID. Options:
   - **MIME type metadata alongside the CID** in the referencing object
     (post, profile). The post says "this CID is image/jpeg". Simple, but
     the claim is not verified by the protocol. A malicious publisher could
     lie about the type.
   - **Content sniffing** on fetch. The client fetches the bytes and detects
     the type from magic bytes. Reliable but requires fetching the full
     object first.
   - **Daemon metadata:** the daemon could store and serve MIME type metadata
     alongside the content. Requires a daemon change.

   For Spoke v1, MIME type metadata in the referencing object is sufficient.
   The type claim is trusted because the publisher is the identity that wrote
   the post.

3. **Caching and pinning:** binary objects are larger, so local cache
   eviction matters more. Pinning a post with a 2 MB image means the relay
   stores 2 MB. Pinning a video could mean 500 MB. The relay pinning
   allowlist (Jolt card 089) does not currently enforce size limits.

4. **Streaming:** videos and large images benefit from partial fetch or
   streaming. Jolt does not currently support range requests or chunked
   content transfer. This is a future protocol consideration, not a v1
   Spoke concern.

**Recommendation for Spoke v1:** support images (JPEG, PNG, WebP, GIF) with
a client-enforced size limit of 10 MB per attachment. Videos are deferred to
a future card because they require protocol-level streaming and relay storage
policy work. Link attachments are metadata-only (no binary content).

## What to Build

### Post v2 schema

```json
{
  "schema": "spoke.post.v2",
  "id": "post_abc123",
  "author": "alice.jolt",
  "displayName": "Alice",
  "title": "Check this out",
  "body": "Found this amazing view today.",
  "attachments": [
    {
      "type": "image",
      "contentId": "Qm...",
      "mimeType": "image/jpeg",
      "alt": "Mountain landscape at sunset",
      "width": 1920,
      "height": 1080,
      "size": 2456789
    },
    {
      "type": "link",
      "url": "https://example.com/trails",
      "title": "Local hiking trails",
      "description": "A guide to trails in the area"
    }
  ],
  "createdAt": "2026-06-10T12:00:00Z",
  "path": "/spoke/posts/post_abc123"
}
```

The `attachments` array is optional. Posts with no attachments are
semantically identical to `spoke.post.v1` posts.

### Attachment types

#### Image attachments

- User selects one or more image files in the post composer.
- Client validates: JPEG, PNG, WebP, or GIF. Maximum 10 MB per image.
- Client resizes if needed (keep original aspect ratio, cap longest edge at
  2048 pixels).
- Client publishes each image binary to `/spoke/media/{mediaId}` via
  multipart publish.
- Client receives CIDs and constructs attachment entries.
- Client publishes the post JSON with attachment references.

Rendering:

- Fetch image binary by CID through the daemon.
- Display inline in the post card. One image full-width, multiple images in
  a grid.
- Show `alt` text as a caption or tooltip.
- If CID is unreachable, show a placeholder with the alt text.

#### Link attachments

- User pastes a URL in the post composer.
- Client creates a link attachment entry with the URL.
- Optionally: client fetches Open Graph metadata from the URL (title,
  description, image) and embeds it. This requires the client to make an
  external HTTP request, which may not work in desktop/Tauri mode.
- For v1, link attachments are manual: the user provides the URL, title,
  and description. No automatic metadata fetching.

Rendering:

- Display as a card with the title, description, and clickable URL.
- If an Open Graph image CID is included, render it as a thumbnail.

### Media namespace

Binary content published by Spoke lives under `/spoke/media/{mediaId}`. This
is a flat namespace independent of posts and profiles. Reasons:

- The same image could be referenced by multiple posts or a post and a
  profile. A flat namespace avoids duplication.
- The daemon does not enforce relationships between paths. Flat paths are
  simpler for inventory and pinning.
- Content-addressing deduplicates identical files automatically.

### Post composer changes

- Add an image upload button that opens a file picker (filtered to image
  types).
- Add a link attachment button that prompts for URL, title, and description.
- Show attachment previews in the composer before publishing.
- Show a publishing progress indicator for multi-step publish (upload images
  first, then publish post).

### Feed rendering changes

- Post cards render image attachments inline.
- Post cards render link attachments as preview cards.
- Attachment rendering degrades gracefully if CIDs are unreachable.

### Feed index compatibility

The feed index (`spoke.feed.v1`) does not change. Feed entries already
include `contentId` so readers fetch the full post JSON, which now may
contain attachments. Clients that do not understand v2 posts should still
render `title` and `body` and ignore the `attachments` field.

## Design Decisions

### D1: Image size limits

Client-enforced limits:

- Maximum file size: 10 MB per image.
- Maximum dimensions: 2048px on the longest edge (client resizes before
   publish).
- Maximum attachments per post: 4 images.
- Supported formats: JPEG, PNG, WebP, GIF.

These are Spoke policy decisions, not protocol limits. The daemon accepts
any binary content.

### D2: Video deferral

Videos are not included in this card. Reasons:

- Typical video files are 50-500 MB, far beyond what is reasonable for
  content-addressed p2p transfer without streaming or chunking.
- Relay pinning a video would consume significant storage.
- Client rendering requires video playback support.
- Jolt does not support range requests or streaming fetch.

A future "Spoke Video" card would need to be preceded by protocol-level work
on chunked content transfer, streaming fetch, and relay storage policy.

### D3: Automatic link metadata

Should Spoke automatically fetch Open Graph metadata when a user pastes a
URL?

- **Manual only (recommended for v1):** the user provides URL, title, and
  description. Simpler, no external HTTP requests, works in all runtimes.
- **Automatic:** Spoke fetches the URL's Open Graph tags and populates the
  link card. Better UX but requires network access to arbitrary external
  URLs, which may be blocked in desktop/Tauri sandbox and raises privacy
  concerns (Spoke would leak which URLs the user is looking at).

Manual only for v1. Automatic metadata can be added later as an optional
enhancement.

### D4: Deduplication

If Alice uploads the same image twice, content-addressing deduplicates it
automatically (same bytes = same CID). No client-side deduplication is
needed. However, each upload creates a separate `/spoke/media/{mediaId}`
path entry. The daemon stores the content once but tracks two paths. This is
acceptable for v1.

## Acceptance Criteria

- [ ] A user can attach one or more images to a post.
- [ ] Images are published as binary content objects and referenced by CID.
- [ ] Contacts see inline images when viewing the post in their feed.
- [ ] A user can attach a link to a post with manual title and description.
- [ ] Contacts see a link preview card when viewing the post.
- [ ] Image attachments degrade gracefully when CIDs are unreachable.
- [ ] Posts with no attachments render identically to current posts.
- [ ] The feed index schema does not change.
- [ ] Client enforces image size, dimension, and format limits.

## Non-Goals

- Video attachments (requires protocol-level streaming work).
- Audio attachments.
- Automatic link metadata fetching (Open Graph).
- File attachments (documents, PDFs).
- Image editing or filters in the composer.
- Image galleries or lightbox view.
- Content-addressed deduplication beyond what the daemon provides.

## Verification

- Green: `npm test` in `/home/alexander/Code/Apps/jolt-apps/spoke`.
- Green: `npm run build` in `/home/alexander/Code/Apps/jolt-apps/spoke`.
- Green: Alice publishes a post with two images and a link. Bob fetches the
  post and sees both images inline and the link preview card.
- Green: Alice publishes a post with an image. Alice goes offline. Bob
  cannot fetch the image CID and sees a placeholder with alt text.
