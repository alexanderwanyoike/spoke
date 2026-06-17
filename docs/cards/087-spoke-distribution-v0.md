# 087: Spoke Distribution v0

**Type:** AFK  
**Milestone:** v0 Endgame  
**Status:** Implemented; manual smoke remaining  
**Blocked by:** 086

## Why

Spoke needs a boring install/update path so people do not need to clone the
repository to try the social app.

## What Landed

- Linux AppImage release packaging.
- `install-spoke.sh` installer with check/update/force/dry-run support.
- Release assets and `latest.json`.
- Tauri updater configuration and minimal in-app update surface.
- Cross-platform packaging follow-up.

## Implementation

Implemented across Spoke PRs #6 and #9:

- <https://github.com/alexanderwanyoike/spoke/pull/6>
- <https://github.com/alexanderwanyoike/spoke/pull/9>

## Remaining Manual Smoke

- Installed Spoke requests access through Jolt Console.
- Installed Spoke publishes and reads a post against packaged Jolt.

