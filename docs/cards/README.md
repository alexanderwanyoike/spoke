# Spoke Work Cards

This folder owns the Spoke application backlog. Jolt protocol cards may mention
Spoke as a proving app, but Spoke product/UI/social cards should live here.

## Current Stack

| Card | Type | Status | Summary |
|---|---|---|---|
| [086](086-spoke-desktop-shell-v0.md) | AFK | Implemented | Tauri desktop shell around the Spoke Vite app. |
| [087](087-spoke-distribution-v0.md) | AFK | Implemented; manual smoke remaining | AppImage packaging, installer, and signed update path. |
| [091](091-spoke-visible-thread-conversations.md) | HITL then AFK | Ready next | Recursive shared post threads with participant-owned replies. |
| [092](092-spoke-rich-user-profiles.md) | HITL then AFK | Implemented | Profile v2 with avatar, links, location, and pronouns. |
| [093](093-spoke-rich-posts-and-non-text-content.md) | HITL then AFK | Partially implemented | Image post/message attachments are in; link cards and media policy cleanup remain. |
| [094](094-spoke-follow-requests-and-direct-messaging.md) | HITL then AFK | Implemented; polish remaining | Follow requests, accepted contacts, and one-to-one encrypted DMs. |
| [095](095-spoke-ui-system-tailwind-shadcn.md) | HITL then AFK | Implemented; polish remaining | Tailwind/shadcn app shell, dialogs, routes, profile, messages, and notifications. |
| [096](096-spoke-media-completion-and-link-cards.md) | AFK after design | Ready after 091 | Finish remaining media/link attachment gaps after thread shape is settled. |
| [097](097-spoke-social-product-slice-and-community-identities.md) | HITL | Discussion next | Decide Spoke's coherent social release and model groups/pages/orgs as Jolt identities. |
| [098](098-spoke-regression-test-harness-and-ui-coverage.md) | AFK | Ready after 091/096/097 | Add UI coverage and a repeatable Bob/Alice/Carol regression harness. |

## Reconciliation Notes

- Old Spoke card PRs `#7` and `#8` are superseded by this reconciled stack.
- The recursive reply work from old card `091` remains important and is still
  not implemented by the current flat owner-curated thread index.
- Old rich profile/media/messaging cards are marked according to what landed in
  PRs `#11` through `#18`.
- Group chat is not the target model. Groups, pages, and organisations should
  be Jolt identities with their own profiles, posts, membership/admin policy,
  and follow-request surfaces.

