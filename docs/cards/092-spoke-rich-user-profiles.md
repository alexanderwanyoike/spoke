# 092: Spoke Rich User Profiles

**Type:** HITL then AFK  
**Milestone:** Spoke Social Network  
**Status:** Implemented  

## Why

Profiles need enough shape for users to recognise each other: avatar, display
name, bio, links, location, and pronouns.

## What Landed

- `spoke.profile.v2` compatibility while preserving v1 display name/bio.
- Avatar attachment references.
- Profile links, location, and pronouns.
- Profile editor UI.
- Profile-aware names and avatars across feed, replies, notifications,
  contacts, and messages.
- Graceful avatar fallback and retry behavior.

## Implementation

Implemented in Spoke PR #16 and refined in PR #18:

- <https://github.com/alexanderwanyoike/spoke/pull/16>
- <https://github.com/alexanderwanyoike/spoke/pull/18>

## Remaining Follow-Ups

- Decide whether avatar pinning should be automatic.
- Add stronger avatar resize/dimension policy if needed.
- Cover profile edit modal behavior in UI tests.

