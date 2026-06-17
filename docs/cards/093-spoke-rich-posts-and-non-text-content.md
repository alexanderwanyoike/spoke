# 093: Spoke Rich Posts and Non-Text Content

**Type:** HITL then AFK  
**Milestone:** Spoke Social Network  
**Status:** Partially implemented  

## Why

Spoke posts should support richer content without turning Jolt into an
app-specific media protocol. Small images can be app-level attachments today;
large video needs generic Jolt chunking/streaming work later.

## What Landed

- `spoke.post.v2` image attachments.
- JPEG, PNG, and WebP validation.
- Binary publish through the Tauri app API under `/spoke/media/{id}`.
- Composer previews, alt text, remove controls, and unavailable-image
  fallbacks.
- Feed image rendering.
- Encrypted image attachments for direct messages.

Implemented in Spoke PR #15 and expanded by the UI PR:

- <https://github.com/alexanderwanyoike/spoke/pull/15>
- <https://github.com/alexanderwanyoike/spoke/pull/18>

## Remaining Work

- Link attachment schema and manual link-card composer.
- Link preview card rendering.
- Decide whether GIF belongs in v1.
- Decide final image size/dimension policy. Current implementation allows
  JPEG/PNG/WebP up to 5 MB.
- Consider client-side resizing before publish.

## Non-Goals

- Native video.
- Audio attachments.
- Automatic Open Graph fetching.
- Transcoding.
- Protocol-level media semantics.

