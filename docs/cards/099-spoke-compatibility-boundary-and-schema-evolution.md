# 099: Spoke Compatibility Boundary and Schema Evolution

**Type:** AFK  
**Milestone:** Spoke Social Network  
**Status:** Ready after 091 stabilises  
**Blocked by:** 091

## Why

Spoke social data is already evolving: flat legacy replies, recursive thread
replies, richer profiles, media references, and future post/message schemas can
all exist in the same local store or network history. During 091 testing, one
malformed legacy reply object was enough to abort the feed snapshot and hide
valid recursive replies in the UI. The API data was present, but the frontend
trusted fetched objects too early.

Spoke needs a deliberate compatibility boundary so old objects remain readable,
new objects are written in the current shape, and invalid historical objects
cannot poison the whole product surface.

## What to Build

- Add a small compatibility/codecs layer for Spoke objects fetched from Jolt:
  posts, replies, profiles, messages, feed indexes, thread manifests, and media
  references.
- Treat data from fetch, decrypt, ingress, and local published history as
  `unknown` until decoded.
- Normalize decoded objects into current canonical app models before they reach
  feed/profile/message rendering.
- Use tolerant readers and strict writers:
  - read supported historical schemas;
  - upgrade recoverable old objects;
  - skip unrecoverable or unknown objects with non-blocking diagnostics;
  - publish only the newest schema.
- Add historical fixture files for old and malformed Spoke objects.
- Add feed/thread composition tests proving one invalid object cannot hide valid
  posts or replies.
- Add a rendered UI smoke test for mixed-version thread data once the regression
  harness exists.

## Acceptance Criteria

- [ ] Spoke fetch/decrypt/ingress call sites no longer cast raw JSON directly to
      app schema types.
- [ ] Reply decoding accepts valid `spoke.reply.v1` and `spoke.reply.v2` objects
      and returns the current canonical reply shape.
- [ ] Reply decoding skips malformed legacy replies without throwing.
- [ ] Post, profile, message, feed index, thread manifest, and media reference
      decoders have fixture-backed tests for supported schema versions.
- [ ] Mixed-version feed/thread fixtures render all valid posts and replies.
- [ ] A single invalid fetched object cannot abort a feed, profile, messages, or
      notifications refresh.
- [ ] New publishes use only the current schema version for each object type.
- [ ] Compatibility policy is documented near the codecs: supported read
      versions, write version, and removal/deprecation process.

## Non-Goals

- Changing the Jolt daemon protocol.
- Migrating old network objects in place.
- Supporting every broken historical shape forever.
- Replacing the Bob/Alice/Carol regression harness from card 098.

