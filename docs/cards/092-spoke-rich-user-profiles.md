# 092: Spoke Rich User Profiles

**Type:** HITL then AFK
**Milestone:** Post-v0 Social
**Status:** Designed in PR
**Blocked by:** None
**Related:** 093

## Why

Current Spoke profiles are a display name and a bio string. That is not enough
for people to recognise each other in a social app. Real profiles need a
picture, links, and enough structure for other users to decide whether to
engage.

Profiles are also the first place where non-text content touches Spoke: a
profile picture is a binary image that needs to be published, referenced by
CID, and fetched by other users. This card pressures the same binary-content
path that rich posts need (card 093).

## What to Build

### New profile schema

```json
{
  "schema": "spoke.profile.v2",
  "identity": "alice.jolt",
  "displayName": "Alice",
  "bio": "Building things on Jolt.",
  "avatar": {
    "contentId": "Qm...",
    "mimeType": "image/jpeg",
    "size": 24567
  },
  "links": [
    { "label": "Website", "url": "https://example.com" },
    { "label": "GitHub", "url": "https://github.com/alice" }
  ],
  "location": "Berlin",
  "pronouns": "she/her",
  "updatedAt": "2026-06-10T12:00:00Z"
}
```

Fields after `bio` are all optional. Clients that only understand v1 profiles
should still render `displayName` and `bio` from the v2 object.

### Avatar publishing flow

1. User selects an image file in the profile editor.
2. Client publishes the image binary to `/spoke/media/{mediaId}` via the
   existing daemon multipart publish endpoint.
3. Daemon returns the `content_id` (CID) for the uploaded image.
4. Client constructs the v2 profile with the avatar `contentId`.
5. Client publishes the profile JSON to `/spoke/profile` as normal.

No new daemon API is needed. The same flow applies to post image
attachments in card 093.

### Avatar rendering

- When rendering a profile, fetch the avatar binary by CID.
- Display inline as an `<img>` with the CID as the source (fetched through
  the daemon or a local data URL).
- If the CID is unreachable (peer offline, not cached), show a fallback
  with the first letter of the display name.
- Optionally pin the avatar so it stays available through the user's home
  relay.

### Profile fetching for contacts

- When Spoke loads a contact's feed, it already resolves the contact's
  identity and fetches `/spoke/feed`. Extend this to also fetch
  `/spoke/profile` and cache the result locally.
- Display the contact's profile picture next to their posts and replies.
- Cache profile pictures in memory or IndexedDB to avoid re-fetching on
  every feed refresh.

### Backward compatibility

- `spoke.profile.v1` profiles (current) only have `identity`,
  `displayName`, `bio`, and `updatedAt`.
- v2 clients reading a v1 profile should treat all new fields as absent.
- v1 clients reading a v2 profile should still see `displayName` and `bio`
  because the JSON structure is a superset.

## Design Decisions

### D1: Avatar size limits

Avatars should be small. Recommended limits:

- Maximum dimensions: 512x512 pixels. Client resizes before publishing.
- Maximum file size: 500 KB after resize.
- Supported formats: JPEG, PNG, WebP.

These limits are enforced client-side, not by the daemon. The daemon accepts
any binary content; Spoke decides what is reasonable for a profile picture.

### D2: Avatar pinning

Should Spoke automatically pin the user's avatar to their home relay?

- **Yes (recommended):** the avatar should be as available as the profile
  itself. If the user goes offline, contacts should still see their picture.
  Pinning the avatar alongside the profile is the simplest way.
- **No:** save relay storage. Contacts that fetch the profile while the user
  is online will cache it locally, but it becomes unavailable when the user
  goes offline.

### D3: Profile path

Profiles currently live at `/spoke/profile`. This card keeps the same path
and updates the schema version. The profile is always the latest published
state under that path. No history or versioning of profiles at this stage.

## Acceptance Criteria

- [ ] A user can set a profile picture in the profile editor.
- [ ] The profile picture is published as a binary content object and
      referenced by CID in the v2 profile.
- [ ] Contacts see the profile picture next to the user's posts and replies.
- [ ] If the avatar CID is unreachable, a fallback is shown.
- [ ] A user can add links, location, and pronouns to their profile.
- [ ] v1 profiles still render correctly in the updated client.
- [ ] The `/spoke/profile` path does not change.

## Non-Goals

- Profile banners or cover images.
- Profile edit history.
- Profile verification or identity proofs.
- Custom profile themes or colours.
- Animated avatars.

## Verification

- Green: `npm test` in `/home/alexander/Code/Apps/jolt-apps/spoke`.
- Green: `npm run build` in `/home/alexander/Code/Apps/jolt-apps/spoke`.
- Green: Alice sets a profile picture. Bob adds Alice as a contact and sees
  her avatar next to her posts.
- Green: Alice goes offline. Bob still sees her avatar (pinned or cached).
