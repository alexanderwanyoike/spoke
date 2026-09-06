# Spoke desktop performance investigation

**Result:** the accepted flat theme removes the expensive shadows and page
gradients, with keyboard focus shown by outlines. The maximized scroll check
improved from **571.7 ms to 13.8–14.2 ms p95 painting**. Native hover, wheel,
and typing checks stay below 25 ms maximum paint. Production build, 116 JS
tests, five Rust tests, and the live desktop regression check pass.

## Scope and starting point

- Machine: CachyOS, KDE Wayland, NVIDIA RTX 2060 (user-reported); system
  WebKitGTK reports **2.52.6** through pkg-config.
- Repository: `/home/alexander/Code/Apps/spoke`, branch `dev`.
- Pulled latest with `git pull --ff-only`: `fd95d11` → `18e079d`.
- Working tree was clean. Jolt Console and its daemon are already running;
  neither their files nor their processes will be changed.
- User's prior measurements: approximately 16 s paint time in 40 s of hovering,
  full-window slow paints of 190–295 ms, under 0.3 s JavaScript, negligible
  layout/style, and approximately 25% idle WebKitWebProcess CPU. These are
  reported observations, not yet independently reproduced.

## Method

Build and run the current app on this desktop, identify its WebKit process,
and compare repeated measurements with the installed Console. Record window
state and workload with each result. Change one variable at a time; revert
experiments that do not improve the measurement. Behavioral fixes require a
focused failing test before implementation, followed by the passing test and
suite. Test-first does not apply to this documentation or temporary measurement
tooling.

## Preparation

- Initial sandbox hid host processes; desktop access became available when the
  user updated permissions and instructed continuation.
- No node_modules or Rust build cache was present in this checkout. Node and
  Cargo are installed, but npm is absent from PATH. Downloaded npm 11.9.0 to
  `/tmp/spoke-perf-tools` to install the existing lockfile dependencies; this
  adds no application dependency or system package.
- npm also rewrote yarn.lock during installation; restored that incidental
  change. No dependency files changed.
- Production build succeeded (`npm run desktop:build -- --no-bundle`, npm
  wrapper and Cargo cache under `/tmp`). Existing suite: 22 files / 116 tests
  passed.

## Runtime and launch observations

- Console PID 24518, WebKit process 24581, daemon 24620. `/proc/24581/maps`
  shows bundled WebKit rather than the system library. Its exported version
  functions report **2.50.4** (also checked by disassembly).
- Initial Console idle samples: 0.05%, 0.30% of one core over 20 s. These
  preparation samples had uncontrolled visibility/build activity and are not
  the final matched comparison.
- Unmodified native Spoke exits at launch on Wayland. `WAYLAND_DEBUG=1` shows
  `wl_display.error(wp_linux_drm_syncobj_surface_v1, 4, "explicit sync is used,
  but no acquire point is set")`. No usable window or paint baseline from this
  launch.
- `GDK_GL=disable` allows this same binary to open; GTK warns that hardware
  acceleration is disabled. This is a **launch workaround**, not a demonstrated
  stutter fix. All measurements using it must be labeled accordingly.
- Spoke uses the existing authorized session and can open the existing message
  thread. No test message has been sent. Remote inspector bound to localhost
  (`WEBKIT_INSPECTOR_HTTP_SERVER=127.0.0.1:9231`) supplies DOM and Timeline access.
- Initial idle samples with the launch workaround: 1.80% on Feed and 4.15% on
  Messages, each 20 s; visibility/input not yet controlled. Baseline hover and
  paint measurements in preparation. No source-code performance change yet.

## Reproduced baseline (local build, packaged runtime)

- Installed Spoke also bundles WebKitGTK **2.50.4**. Both AppImages' GTK launch
  hooks force `GDK_BACKEND=x11`, so on this Wayland desktop these apps use
  **XWayland**, not native Wayland. Console was not modified.
- Extracted the installed Spoke AppImage into `/tmp/spoke-perf-appimage`, then
  replaced only that temporary copy's `usr/bin/spoke` with the production binary
  just built from `18e079d`. This runs current source with the installed runtime
  and launch hook. No rendering environment overrides used in this baseline.
- View: existing Messages conversation, dark theme, maximized **1920×1022**
  web viewport, scale 1. Native menu hover generated via XTest (100 moves,
  200 ms apart, cycling over five sidebar rows). In a 22 s Timeline capture:
  **14,903 ms painting**, **562 ms maximum paint**, 154 ms FunctionCall time,
  71 ms style, 12 ms layout. This independently reproduces the user's stutter.
- Small-region repaint probes had missed it: sidebar-only paint rectangles
  can be fast even when full-window paints are extremely expensive.
- Added `scripts/check-desktop-paint.mjs`, a live app-level scroll regression
  check using Node's built-in WebSocket and WebKit's localhost inspector. It
  scrolls a real conversation for 24 frames and restores the scroll position.
  No messages are sent, no new dependencies. Red result on unchanged source:
  **24 paints, 13,136 ms total, p95 571.7 ms, max 573.9 ms; frame p95 575 ms**.
  Fails the requirement that p95 painting stays below 50 ms.
- Timeline timestamps require `Page.enable`; early captures without that
  command produced zero timestamps and were discarded for duration analysis.

## Experiment 1 — explicit sRGB gradient interpolation (reverted)

Hypothesis: full-window paints repeatedly rasterize the page's radial gradients
in an expensive color interpolation path in the bundled WebKit renderer.
The solid fills and small dirty rectangles do not expose that cost. Test the
interpolation path without removing the gradients or changing their endpoints.

Change: add `in srgb` to the two body radial gradients. Rebuilt the production
binary and ran it in the same temporary AppImage runtime, same maximized
conversation and theme. Result: **p95 paint 569.5 ms, max 585.6 ms; frame p95
576 ms**. No material improvement versus 571.7 ms baseline. **Reverted** the
two-line CSS change before proceeding. This agrees with the user's previous
background experiments; gradient interpolation does not explain the stutter.

## Experiment 2 — shadow rasterization (diagnostic confirmed; suppression removed)

Attaching gdb to the WebKit child was rejected by the kernel's ptrace policy;
no permissions or system settings were changed. Continue with controlled
app-level experiments.

Hypothesis: widespread blurred box shadows make full-window rasterization
expensive. Temporary diagnostic change: suppress box shadows, including pseudo
elements. This is an isolation experiment, not an acceptable final feature
removal. If it improves paints, preserve the shadows through a cheaper rendering
implementation. Gradient experiment has already been reverted. Same regression
check and rebuild completed.

The first two runs had a black window and `document.hidden === true`; they
timed out and are invalid performance samples. The unchanged baseline binary
also exhibited this launch state. The test X11 window had a stale
`_NET_WM_STATE_HIDDEN` flag despite being visible in KWin. Clearing that test
window's state property restored the webview. No Console or system settings
were touched. The regression check now rejects hidden pages immediately.

Valid shadow-free results at **1280×840**: p95 paint **34.1 ms** (repeat **33.0
ms**), frame p95 **37 ms**. Earlier full-window baseline paints at this size
were about **350–380 ms**. The user independently confirmed: “wow what did you
do its working now”. This establishes that the shadow suppression improves
real interaction, although the blanket rule also suppresses focus rings and
is not the final fix. Removed the blanket suppression for the next experiment.

## Experiment 3 — sRGB shadow color (reverted)

Hypothesis: the wide-gamut color representation of the common foreground
shadows selects an expensive rendering path. Restore every shadow and focus
ring, but resolve the `.shadow-foreground/5` color into sRGB using CSS relative
color syntax. Offsets, blur, spread, and opacity stay the same. Rebuilt and
measured: **p95 paint 567.8 ms, max 584.7 ms, frame p95 573 ms**, at 1920×1022.
The user also immediately reported the lag returning. No improvement; reverted
this change. Returned the running app to the shadow-free diagnostic binary
while preparing the next experiment.

The matched 1920×1022 shadow-free test measured **57.5 ms p95 paint / 62 ms
p95 frame**. This is much better than the baseline but still above the final
target; the earlier 33 ms result was at 1280×840. Remaining full-window costs
must also be addressed. At this point suppression remained diagnostic; the
user's subsequent flat-style choice below determined the final design.

## Final design direction and experiment 4 — flat page fill (retained)

- The user confirmed the shadow-free build was “buttery smooth” and explicitly
  chose **“keep the flat look”**. This supersedes the earlier plan to retain
  decorative soft shadows. Social features remain intact.
- Final shadow policy suppresses box shadows consistently, including portals
  and pseudo-elements. Keyboard focus uses a 2 px outline instead of a shadow
  ring. Added a live focus check first: it failed against the diagnostic build;
  it passes after adding the outline.
- Flat shadows + focus outlines: 1280×840 p95 paint **46.0 ms** during a Rust
  build (not a quiet performance sample). A quiet maximized 1920×1022 check
  still fails: **61.1 ms p95 paint / 67 ms p95 frame**. The main stutter is gone,
  but this full-window stress case exposes a smaller residual cost.
- Hypothesis 4: with shadows removed, the two full-page radial gradients are
  the remaining rasterization cost. Match the accepted flat design with the
  existing solid theme background instead. This differs from experiment 1,
  which retained both gradients and only changed their interpolation.
- The maximized regression check failed before this change. After rebuilding,
  same runtime, theme and viewport: **14.2 ms p95 paint, 15.5 ms maximum paint,
  22 ms p95 frame**. Retained the solid theme fill: it removes the residual
  gradient cost after the dominant shadow cost has been removed.

## Final interaction validation

Current source built as a production binary, running in the same extracted
Spoke AppImage runtime. Viewport 1920×1022, scale 1. Native input generated
through XTest; Timeline records actual WebKit paints (not React render counts).

| Workload | Baseline p95 paint | Final p95 paint | Final maximum paint |
| --- | ---: | ---: | ---: |
| Repeated menu hovering, 100 native moves | 543.0 ms | 12.5 ms | 22.2 ms |
| Native wheel scrolling, 100 wheel events | — | 18.9 ms | 23.8 ms |
| Native typing, 100 key press/release pairs | — | 22.8 ms | 24.1 ms |
| 24-frame scroll regression, maximized | 571.7 ms | 14.2 ms | 15.5 ms |

The typing run generated **100 input events** and left the original draft
unchanged (alternating a character and Backspace). No message was sent.
The user independently confirmed the shadow-free build was smooth twice,
noticed the regression when shadows were restored, and approved the flat look.

The cause isolated at the app level is expensive painting of decorative box
shadows throughout the UI, plus a smaller full-page gradient cost. Reducing
JavaScript or changing gradient/shadow color interpolation did not address it.
The fix removes those expensive drawing operations; solid fills, existing
borders, and explicit focus outlines retain the visual and keyboard cues.
No social feature, dependency, daemon setting, or Console file changed.

Dark-theme maximized repeat: **13.8 ms p95 paint, 18.7 ms maximum, 20 ms p95
frame**. This matches the original baseline's theme and window size. Light
theme: **14.2 ms p95 paint, 15.5 ms maximum, 22 ms p95 frame**.

Final 20 s CPU samples: Spoke **1.05–1.4%** of one core on the conversation
(including a focused composer in one run), Console **0.25%**. Console's earlier
samples ranged from 0.05–0.30%. These are both low CPU loads but not identical;
the decisive before/after metric is paint latency, with manual confirmation of
smooth input. An attempted XDamage hover-latency comparison did not produce
damage events for Console, so it is not used as evidence of equal frame times.

## Validation and reproduction

- `npm run desktop:build -- --no-bundle` — production build passes.
- `npm test` — **22 test files / 116 tests pass**.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib` — **5 tests pass**.
- `node scripts/check-desktop-paint.mjs` — passes on the visible, focused app
  with a scrollable conversation in both themes, including 1920×1022.
- `node --check scripts/check-desktop-paint.mjs` and `git diff --check` pass.

To rerun the live check, launch Spoke with
`WEBKIT_INSPECTOR_HTTP_SERVER=127.0.0.1:9231`, open a conversation with enough
messages to scroll, bring Spoke to the foreground, then run
`node scripts/check-desktop-paint.mjs`. Keep the window visible. The test
checks the focus outline, performs 24 alternating 64 px scrolls, restores the
scroll position, and requires p95 actual WebKit painting below 50 ms. It rejects
hidden/unfocused pages and missing timestamps instead of reporting false passes.
`SPOKE_INSPECTOR_URL` can select another local inspector port. No dependency
installation is needed for the check beyond Node with built-in WebSocket.

The running review build uses the final production binary in the temporary
extracted AppImage; the installed Spoke AppImage was not overwritten. The user
subsequently requested a PR for review, authorizing publication of this fix.
