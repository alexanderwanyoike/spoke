# Messages: functional replacement slice

Messages is the production application at `/`. The old App.tsx, its stylesheet, both alternate entries, the fictional preview and its SVG have been removed. This implements the first slice from the combined Claude/Codex research, not the remaining Spoke screens. No protocol or Console changes are included.

## Run and use

Run `yarn install --frozen-lockfile`, then `yarn dev`. Open `http://127.0.0.1:5178`, with Jolt running locally. `VITE_JOLT_DAEMON_URL` can select another daemon. The same entry is built for desktop.

1. Connect your identity and approve Spoke in Jolt Console. Saved approved access and pending requests are reused.
2. Choose **New conversation**, enter the other identity and a local contact name, and send a request.
3. The recipient opens **New conversation** and accepts or declines the verified incoming request. Acceptance creates an encrypted contact edge and sends an encrypted response. The requester validates that response against their own saved outgoing request.
4. Once accepted, select the conversation and send text or images. Both sides retain encrypted copies that load again after restarting Spoke.

No sample contacts, messages, media or alternate gateway run in the application. Fixtures exist only in tests. Packaged desktop users retain the signed update flow through **Updates**.

## Ownership and invariants

| Area                              | Responsibility                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `src/app/App.tsx`                 | Connection, shell and routes; no data workflows                                 |
| `src/connection/access.ts`        | Spoke capability policy, approval and saved access restoration                  |
| `src/connection/monitor.ts`       | Subscription, single-flight checks, polling and cancelled lifetimes             |
| `src/contacts/contracts.ts`       | Validated contact/request/response records and envelope identity agreement      |
| `src/contacts/repository.ts`      | Encrypted contact hydration and send/request eligibility                        |
| `src/contacts/service.ts`         | Request, review, accept/decline and correlated response application             |
| `src/message/gateway.ts`          | Runtime wiring to the current Jolt SDK                                          |
| `src/message/application.ts`      | Compose an identity's private projection and messaging use cases                |
| `src/message/send-workflow.ts`    | Outbox attempts: authorize, prepare, deliver; preserve IDs and uploads on retry |
| `src/message/receive.ts`          | Validate authentic participants, persist encrypted history, then acknowledge    |
| `src/message/media-repository.ts` | Encrypted image publication and decryption                                      |
| `src/message/resource.ts`         | Observable snapshot, freshness, coalesced refresh and cancellation              |
| `src/message/drafts.ts`           | Per-conversation draft and object URL lifetime                                  |
| `src/update/UpdateControl.tsx`    | Explicit update checking and installation through the signed updater client     |

Domain rules are named at application boundaries rather than repeated inside JSX. React Hook Form owns editable form state; Zod validates boundary records. The router owns selection. Context carries stable services and `useSyncExternalStore` subscribes to the feature snapshot. Redux and Zustand are not needed for this slice.

The SDK remains the data authority. Messages use its encrypted publication and ingress APIs: the current typed Data client does not expose an encrypted Messages collection. There is no public-read fallback or historical localStorage importer. The in-memory projection belongs to one identity/session and is discarded on ended access.

Schema hints are optional transport metadata. Incoming classification uses the validated decrypted payload and checks it against the authenticated envelope. The real-node regression caught and fixed the earlier requirement for a schema hint, which the current SDK does not send.

## Behavior and scope

- Responsive list/thread navigation, search, neutral light/dark appearance and accessible dialogs.
- Text and up to four JPEG/PNG/WebP images, 5 MB each, with optional image descriptions.
- Enter and the Send button share submission; Shift+Enter and composition preserve editing.
- Failed sends retain drafts and retry identity. A late success cannot erase newer edits.
- Current-session successful sends say **Sent**. Reloaded outgoing copies say **Outgoing copy**; neither claims delivery receipts.
- A failed refresh retains the last data and exposes retry. Unreadable encrypted records are counted visibly.
- Request review handles verified contact requests. Unsupported or unverified incoming items remain pending and are counted, never silently accepted.
- **Forget access** clears local saved access. Revocation remains in Console. Already dispatched SDK operations cannot be recalled by the frontend.

Posts, feed, profile editing, richer media, activity and other settings are later slices. Their domain modules remain for that work, but the old application shell is not shipped alongside this one. This branch has not been released.

Historical plaintext received copies are neither imported nor made private retroactively. A release decision about those copies remains necessary. This branch does not delete users' historical data.

## Verification

`./scripts/test-local.sh` runs the full fast suite, TypeScript/Vite production build and distribution contract. The current result is **164 passing tests across 37 files**. The real-node test is intentionally skipped by this command and run separately:

```sh
JOLT_BINARY=/absolute/path/to/jolt yarn test:integration
```

Verified with Jolt **0.5.3** and the installed `jolt-sdk` **0.3.x**. The harness allocates loopback ports, creates two disposable XDG profiles, disables mDNS/public bootstrapping, connects them over TCP and grants access only to those generated identities. It cleans up its own processes and profiles after success. It does not use the user's daemon or contacts.

That test executes the production application services against real Jolt: request and acceptance, bidirectional text/image exchange, exact decrypted image bytes, both histories reopened from fresh application instances, and absence of message text in public reads. No gateway is mocked. `yarn test:integration --keep` retains the disposable nodes for browser review until the harness is stopped; it prints their ports and temporary directory.

Browser verification used the production `/` entry against those nodes: actual pending-to-approved sessions, encrypted history and image loading, text and PNG sends from the production composer observed on the other node, a decrypted full-size image, and the contact dialog in light appearance. Component tests cover the full contact form and decision UI, failure/retry, route/search, drafts, stale recovery, approval/revocation, image dialog and URL lifetime, bounded history, and updater compatibility gating.

Focused failing tests preceded contact request/review behavior, missing-hint receipt, accepted-contact protection and update controls. Existing tests guarded the connection/outbox/resource refactors. Entry/build-script/docs changes are tooling changes; test-first does not apply to them.

Remaining verification: physical two-device networking, native WebKitGTK behavior/performance and a signed desktop package. Local TCP verification does not establish those results. Drafts/retry bookkeeping are memory-only; a durable outbox and initial-inventory pagination are follow-ups. Existing Vite/Vitest and upstream Zod annotation warnings remain.
