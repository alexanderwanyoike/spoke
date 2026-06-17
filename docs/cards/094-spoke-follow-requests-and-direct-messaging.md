# 094: Spoke Follow Requests and Direct Messaging

**Type:** HITL then AFK  
**Milestone:** Spoke Social Network  
**Status:** Implemented; polish remaining  

## Why

Spoke needs explicit relationship consent and private one-to-one messages.
The product language has shifted from "friend" to "accepted contact/follow
request", but the trust boundary is the same: recipients decide who can become
an accepted contact.

## What Landed

- `spoke.follow_request.v1` and `spoke.follow_response.v1`.
- Follow requests and responses through encrypted recipient ingress.
- Accepted/requested/rejected local relationship state.
- Known-contact auto-accept for replies and messages.
- One-to-one encrypted direct messages.
- Sender-owned encrypted sent copies.
- Local conversation timeline merging.
- Dedicated Messages section with thread search and media attachment support.

Implemented across Spoke PRs #11, #13, #14, #15, and #18:

- <https://github.com/alexanderwanyoike/spoke/pull/11>
- <https://github.com/alexanderwanyoike/spoke/pull/13>
- <https://github.com/alexanderwanyoike/spoke/pull/14>
- <https://github.com/alexanderwanyoike/spoke/pull/15>
- <https://github.com/alexanderwanyoike/spoke/pull/18>

## Remaining Follow-Ups

- Clarify relationship language in product copy: accepted contacts versus
  friends/followers.
- Better pending sent request handling.
- Better unknown-sender review.
- Remove/block/mute later.
- Delivery/read-ish state only if the Jolt protocol can support it honestly.

## Non-Goals

- Group chat.
- Published social graph.
- Typing indicators.
- Read receipts without protocol support.

