# 095: Spoke UI System with Tailwind and shadcn

**Type:** HITL first, then AFK
**Milestone:** Post-v0 Social
**Status:** Proposed
**Blocked by:** 092, 094
**Related:** 092, 093, 094

## Why

The current Spoke UI is plain React and hand-written CSS. It works for proving
the P2P social flows, but it is starting to fight the product model. Feed,
profile editing, notifications, contacts, and messages need to feel like a
real social application rather than a collection of prototype panels.

The preferred direction is to move Spoke to Tailwind and shadcn/ui before
continuing to polish the interface. This gives us a consistent component
system for navigation, dialogs, tabs, forms, buttons, avatars, cards, sheets,
toasts, and dark mode.

## Current State

- Spoke uses React, Vite, Tauri, lucide-react, and plain CSS in `src/styles.css`.
- Spoke does **not** currently use Tailwind.
- Spoke does **not** currently use shadcn/ui.
- The current UI over-concentrates workflows in one view:
  - feed
  - profile editing
  - contacts/follow requests
  - notifications/incoming ingress
  - profile inspection

## Product Direction

Model Spoke more like X/Facebook/Instagram:

- **Feed:** mixed posts from the local user and accepted contacts.
- **Profile:** read-first user profile and the user's own posts.
- **Edit Profile:** modal/dialog for changing avatar, display name, bio,
  pronouns, location, and links.
- **Messages:** dedicated conversation thread view.
- **Notifications:** top-down activity list, not a centered dashboard card.
- **Find People:** modal/dialog for entering a Jolt ID, previewing the
  published profile if available, setting a local nickname, and sending a
  follow request.

## What to Build

### 1. Add Tailwind and shadcn/ui

- Install and configure Tailwind for the existing Vite React app.
- Add shadcn/ui with a local `components/ui/*` structure.
- Keep lucide-react for icons, matching shadcn conventions.
- Preserve Tauri desktop behavior.
- Remove or shrink `src/styles.css` to app-shell/layout concerns only.

### 2. Define the app shell

Use a left navigation sidebar with:

- Spoke brand
- Feed
- Profile
- Messages
- Notifications
- Add friend / find people action
- Current identity/status area
- Theme toggle

The sidebar should work in both light and dark mode and collapse sensibly on
small windows.

### 3. Rebuild notifications

Notifications should be a top-aligned activity stream:

- Header at top.
- Optional filter chips/tabs: All, Follows, Replies, Messages.
- Chronological list from top to bottom.
- No centered empty dashboard panel.
- Empty state should sit at the top of the list area.
- Follow request rows should show profile context when available:
  - avatar
  - display name
  - Jolt identity
  - bio preview
  - links if useful
  - accept/reject actions

### 4. Rebuild profile

Profile should be read-first:

- Avatar, display name, Jolt identity.
- Bio, pronouns, location, links.
- User's own posts underneath.
- Known people/friends can be a secondary panel or tab.
- Editing happens in a modal/dialog, not inline on the main profile page.

Profile edit dialog should include:

- Avatar upload/remove.
- Display name.
- Bio.
- Pronouns.
- Location.
- Links editor.
- Save/publish action.

### 5. Rebuild find-people/follow request flow

Use a dialog/sheet:

1. User enters a Jolt ID.
2. Client fetches `/spoke/profile` if available.
3. Dialog shows a profile preview.
4. User can set a local nickname.
5. User sends a follow request with an optional note.

If no profile exists, the dialog should still allow sending a request, but it
must make it clear that no public profile was found.

### 6. Add light and dark mode

- Use shadcn/Tailwind CSS variables for theming.
- Provide a visible light/dark toggle.
- Persist preference in local storage.
- Ensure feed, profile, notifications, dialogs, inputs, messages, and media
  attachments all render cleanly in both modes.

## Acceptance Criteria

- [ ] Tailwind is configured and used by Spoke.
- [ ] shadcn/ui is installed and at least these primitives are used:
      Button, Dialog, Avatar, Tabs or ToggleGroup, Input, Textarea, Badge,
      Separator, ScrollArea, Card or equivalent composition.
- [ ] Feed, Profile, Messages, and Notifications are separate sections.
- [ ] Profile editing is in a modal/dialog.
- [ ] Find People / follow request is in a modal/dialog.
- [ ] Notifications render as a top-down activity stream.
- [ ] Follow request notifications show sender profile context when available.
- [ ] Light/dark mode works and persists.
- [ ] Existing social flows still work:
      follow request, accept/reject, feed refresh, replies, messages,
      image posts, and image messages.

## Non-Goals

- New Jolt protocol features.
- Changing profile/post/message schemas.
- Rewriting the social data model.
- Public global search beyond entering a specific Jolt ID.
- Algorithmic notification ranking.

## Verification

- Green: `npm test` in `/home/alexander/Code/Apps/jolt-apps/spoke`.
- Green: `npm run build` in `/home/alexander/Code/Apps/jolt-apps/spoke`.
- Green: `cargo test --manifest-path src-tauri/Cargo.toml`.
- Manual: open Bob, Alice, and Carol clients with their Jolt consoles.
- Manual: verify light and dark mode in all major sections.
- Manual: send a follow request and confirm the recipient notification shows
  the sender profile context when `/spoke/profile` exists.
- Manual: edit a profile through the modal and confirm feed/message avatars
  and names update after refresh.
