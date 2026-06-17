# 098: Spoke Regression Test Harness and UI Coverage

**Type:** AFK  
**Milestone:** Spoke Social Network  
**Status:** Ready after 091, 096, and 097  
**Blocked by:** 091, 096, 097

## Why

Spoke has useful unit coverage for social schemas, feed merging, follow
requests, direct messages, media helpers, and daemon API boundaries. The
remaining risk is product-level regression: modal flows, route composition,
theme/layout polish, and Bob/Alice/Carol social scenarios are still mostly
manual.

## What to Build

- Component tests for reusable Spoke UI pieces extracted from `App.tsx`.
- Browser smoke tests for feed, profile, notifications, people, and messages.
- Scripted Bob/Alice/Carol daemon/client startup.
- Fixture preservation for accepted contacts, pending requests, posts, replies,
  messages, and media.
- Repeatable scenarios for follow request, accept/reject, feed propagation,
  recursive replies, messaging, and image/link attachments.
- Failure logs and screenshots.

## Acceptance Criteria

- [ ] Reusable Spoke components have focused render/interaction tests.
- [ ] Browser smoke tests cover the main routes and modal flows.
- [ ] Bob/Alice/Carol can be started from one command with deterministic ports
      and fixture directories.
- [ ] The harness preserves or rebuilds the friend/contact graph fixture.
- [ ] The harness exercises follow request, accepted contact, post, recursive
      reply, direct message, and media attachment scenarios.
- [ ] Test output includes useful logs and screenshots on failure.

## Non-Goals

- Full protocol simulation in Spoke tests.
- Replacing Jolt daemon/network tests.
- Pixel-perfect visual snapshot testing.
- Mobile testing.

