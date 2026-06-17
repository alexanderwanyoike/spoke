# 096: Spoke Media Completion and Link Cards

**Type:** AFK after design  
**Milestone:** Spoke Social Network  
**Status:** Ready after 091  
**Blocked by:** 091

## Why

Images work for posts, profiles, and messages. The remaining media work should
be a cleanup/completion slice rather than a brand-new media foundation.

## What to Build

- Add a link attachment schema for posts.
- Add manual link-card composer controls: URL, title, description.
- Render link cards in feed/profile/thread views.
- Revisit image policy: count limit, byte limit, dimension limit, and optional
  client-side resizing.
- Keep image fetch failures non-blocking.

## Acceptance Criteria

- [ ] A user can attach a link to a post.
- [ ] Link cards render for contacts without changing the feed index schema.
- [ ] Image attachment policy is documented and tested.
- [ ] Oversized/unsupported files are rejected before publish.
- [ ] Missing media leaves the post readable.

## Non-Goals

- Video attachments.
- Automatic Open Graph fetching.
- Transcoding.
- Large-object streaming.

