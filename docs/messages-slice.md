# Messages: first replacement slice

This branch implements the first Spoke UI slice from the combined Claude/Codex research of 6 September 2026. It is a development milestone, not the full Spoke cutover.

Run `yarn install --frozen-lockfile`, then `yarn dev`. The default port is 5178. If that port is occupied, use `yarn dev --port 5179 --strictPort`.

- `/messages.html` is the new application entry with the current Jolt SDK, compatibility checks and session approval. It requires a running Jolt daemon and accepted contacts.
- `/messages-preview.html#/messages/conv_alex_maya` renders the same components against fictional in-memory data. It has an offline switch and sends no real messages. This entry is excluded from production builds.
- `/index.html` remains the shipped app entry while subsequent features are replaced. The new entry never imports `src/App.tsx` or its runtime. Both real entries are built so this slice remains reviewable before cutover.

## Ownership

| Area | Owns |
| --- | --- |
| `src/app/App.tsx` | Connection boundary, shell and routes |
| `src/connection/` | Persisted access, approval polling, compatibility, session expiry and revocation |
| `src/message/gateway.ts` | Current SDK binding and a private store for this identity/session |
| `src/message/resource.ts` | One coalesced refresh loop, retained data and freshness |
| `src/message/send-workflow.ts` | Contact authorization, encrypted uploads, stable send attempts |
| `src/message/receive.ts` | Envelope/payload agreement, accepted-contact rules, encrypted persistence before acknowledgement |
| `src/message/drafts.ts` | In-memory per-conversation drafts and preview URL lifetime |
| `src/message/components/` | List, conversation, history, composer and image viewer |

React Hook Form owns the form. Zod validates message input, incoming message records and persisted session data at boundaries. The router owns selected conversations. Context supplies stable services; `useSyncExternalStore` subscribes to the Messages snapshot. There is no global UI store, Redux or Zustand.

Messages use the existing SDK encrypted publication and ingress contracts. The typed Data SDK does not currently expose an encrypted Messages collection. This slice does not invent a public collection or a second protocol. Existing typed profile/post resources remain available for their later feature slices. No historical contact/post localStorage importer runs from the new entry.

The synchronous Messages snapshot is a feature projection of encrypted SDK data, not another authoritative database. The refresh loop runs five seconds after the previous load finishes; manual refresh coalesces with an in-flight load. Inventory is shared across the contact and message load. Unchanged message copies retain the existing loader's sequence checks. Rendering history is bounded to the latest 100 messages with an explicit earlier-history action; initial inventory enumeration is not paginated.

## Behavior

- Desktop list/thread layout and narrow single-pane navigation, light/dark appearance, search and empty states.
- Text and up to four JPEG/PNG/WebP images, 5 MB each; optional descriptions and a keyboard-accessible viewer.
- Button and Enter share one submission path. Shift+Enter preserves a newline; composition events do not submit.
- Failed sends retain drafts and message IDs. Navigation retains separate drafts. A late success cannot erase newer edits. Drafts are memory-only and clear on application reload or ended access.
- Successful sends in this session say “Sent”, never “Delivered”. Loaded outgoing copies say “Outgoing copy” because their presence alone does not prove successful ingress delivery.
- Refresh failure retains the last available data with a notice. Missing/undecodable encrypted copies are counted visibly.
- Existing saved or pending access is reused. “Forget access” clears this browser's saved token; revocation remains in Console.
- Stopping the session aborts subsequent stages of pending work. SDK requests already dispatched cannot be recalled by the frontend.

## Privacy change and historical data

New received copies are encrypted to the receiving identity. The reader uses encrypted reads for both outgoing and received copies. Regression tests verify these SDK calls and the absence of a public-write/public-read fallback.

This does not retract or encrypt received copies previously published as plaintext. They are not imported by this reader; unreadable copies produce a notice. A historical-data decision is required before making this entry the shipped default. The existing app entry also receives the encrypted write/read fix on this branch.

## Verification and remaining work

Focused failing tests preceded the received-copy fix, failure reporting, image composer, snapshot lifecycle, session restoration, stable send retries, cancellation and receipt acknowledgement retry. The updated existing inbox failure test exercises encrypted persistence.

Verified locally: 153 tests across 34 files, production TypeScript/Vite build of both entries, distribution contract and shell syntax. Dependency installation uses Yarn's frozen lockfile. Formatting of the new files uses Prettier with the repository configuration; packaging and Tauri build commands now use Yarn consistently.

Browser checks exercised conversation switching, retained drafts, failed send/retry, search, narrow back navigation, theme switching and the image dialog's Escape/focus-return behavior. Measured CSS widths were about 433, 1222 and 1422 pixels because the in-app browser scales its requested viewport; DOM bounds showed no page overflow. The real connection entry reached identity selection through the running daemon without requesting new access. A fresh preview load produced no new browser errors after the development hot-reload refactor.

No real person was messaged and no new app grant was approved. Two-device delivery, native WebKitGTK behavior/performance and signed desktop packaging remain unverified for this slice. Dependency tools still report the pre-existing Vitest/Vite major-version mismatch and harmless upstream Zod annotation warnings.

Before default cutover: contact/request review and connection settings, richer media, durable outbox semantics, historical-data policy, public profile names through typed Data resources, and native/two-device verification. Posts/feed/people/activity/settings are separate feature slices. Console remains a later implementation with the agreed fixed 1100 × 760 window.

## Component regression coverage

| Tests | Components and behavior exercised |
| --- | --- |
| `src/app/App.test.tsx` | Actual App, shell, MessageSession, MessagesPage, conversation list/panel and avatars: routes, search, draft retention, refresh recovery, read-only history, appearance and access teardown |
| `src/connection/ConnectionBoundary.test.tsx` | Input validation, one approval request, pending-to-connected transition, retained child state during network failure, revocation and startup retry |
| `src/message/components/MessageImage.test.tsx` | Failed-load retry, dialog accessibility, Escape/focus return, image decoding failure and URL cleanup after retry/unmount |
| `src/message/components/MessageList.test.tsx` | Recent-history bound and explicit earlier-message navigation; delivery labels are also exercised through App |
| `src/message/components/MessageComposer.test.tsx` | Composer, ImagePicker and DraftImages: text/image submission, retained drafts, pending edits, attachment descriptions/removal, empty validation and Shift+Enter |

These tests render the production components and replace the SDK/network boundary. Display-only components are covered through their consuming screen. Bootstrap entry files and the fictional development harness retain build/browser smoke verification rather than duplicate rendering tests. The coverage follow-up adds tests for existing behavior; it changes no production behavior.
