# 097: Spoke Social Product Slice and Community Identities

**Type:** HITL  
**Milestone:** Spoke Social Network  
**Status:** Discussion next  
**Blocked by:** 091, 092, 093, 094, 095

## Why

Spoke has enough mechanics to become a coherent small social app, but the
product language and boundaries need to be explicit before adding more surface
area.

## What to Decide

- Relationship language: follow, accepted contact, friend, or another term.
- Default post/reply visibility.
- Whether recursive thread replies require accepted contact status.
- What moderation control a post author has over replies.
- How much local-only state is acceptable before app data follows identity.
- What media types ship in the first social release.
- How groups, pages, and organisations work.

## Groups, Pages, and Organisations

Do not model these as chat groups first. Model them as Jolt identities.

A community/page/org identity can have:

- its own profile;
- its own posts and thread manifests;
- member/admin metadata;
- follow requests to the identity;
- policies for whether members can see other members;
- policies for whether members can send follow requests to each other.

This keeps the model aligned with Jolt's core rule: identity-owned namespaces,
authorized writers, and explicit revocation. Multi-admin communities should wait
for the Jolt identity/device writer model to mature.

## Acceptance Criteria

- [ ] Product decision recorded for relationship language.
- [ ] Product decision recorded for default post/reply visibility.
- [ ] Product decision recorded for group/page/org identity model.
- [ ] Demo checklist covers Bob, Alice, Carol, and one community/page identity
      if the community model is in scope.
- [ ] Follow-up cards are split for any protocol/device-identity dependencies.

## Non-Goals

- Implementing groups/pages/orgs in this card.
- Algorithmic feed ranking.
- Global search.
- Platform-wide moderation.
- Group chat.

