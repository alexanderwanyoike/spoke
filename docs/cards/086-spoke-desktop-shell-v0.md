# 086: Spoke Desktop Shell v0

**Type:** AFK  
**Milestone:** v0 Endgame  
**Status:** Implemented  

## Why

Spoke needed to become a desktop app so the demo path could be install Jolt,
install Spoke, approve Spoke in Console, then publish/read social content
without running a dev server.

## What Landed

- Tauri desktop shell around the existing Vite app.
- Desktop dev/build scripts.
- Tauri bridge for daemon/app API calls where browser fetch is not enough.
- Linux AppImage build target.
- README documentation for desktop dev/build usage.

## Implementation

Implemented in Spoke PR #5:

- <https://github.com/alexanderwanyoike/spoke/pull/5>

## Remaining Notes

The desktop shell itself is done. Full packaged multi-identity social smoke is
tracked through the distribution and regression harness cards.

