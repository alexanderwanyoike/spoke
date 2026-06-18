# 105: Complete the Jolt SDK Seam (relocate transport, evict Spoke types from api.ts)

**Type:** AFK after design
**Milestone:** Spoke Social Network (architecture refactor, epic 100)
**Status:** Not started
**Depends on:** 101 (seam established)
**Related:** 104 (enumeration DTO mapping is a slice of this), 099 (decoders)

## Why

Card 101 set the goal "create `src/jolt/` (pure transport ACL, strip Spoke
domain types out of `api.ts`)" but only delivered the seam as a thin wrapper:
the actual transport still lives in `src/api.ts`, and `src/jolt/index.ts`
delegates to it. The dependency arrow is inverted - the "pure transport
boundary" depends on `api.ts` instead of being the transport. On top of that,
`api.ts` still mixes raw Jolt transport with Spoke domain types
(`SpokePost`, `SpokeProfile`, `SpokeReply`, `SpokeFeedIndex`), which is the exact
"no SDK seam" problem `docs/CONTEXT.md` describes.

This card finishes 101's stated goal: make `src/jolt/` the real transport home
and remove Spoke vocabulary/types from the transport layer.

## What to build

### 1. Relocate pure Jolt transport into `src/jolt/`
Move the transport core and primitives out of `api.ts` into `src/jolt/`
(e.g. `src/jolt/transport.ts` for the wire layer, kept private behind the
barrel):
- The request core: Tauri `invoke` vs `fetch` routing, `jsonInit`/`bearerInit`,
  base-path handling.
- Daemon operations: `getStatus`, session lifecycle (request/status/current),
  `listPublished`, `publishJson`, `publishBinary`, `publishEncryptedJson`,
  `publishEncryptedBytes`, `publishEncryptedBinary`, `resolveAddress`,
  `fetchTarget`, `decryptEncryptedTarget`, ingress
  (`listPendingIngress`/`openIngress`/`acceptIngress`/`rejectIngress`),
  `sendObjectByIdentity`, and byte helpers (`decodeFetchData`,
  `decodePlaintext`, `parseJsonBytes`).
- Transport DTOs: `PublishResponse`, `EncryptedPublishResponse`,
  `PublishedContent`, `ResolveResponse`, `FetchResult`, `IngressRecord`,
  `DecryptedIngress`, `DecryptedEncryptedObject`, `NodeStatus`, session types.

The existing `JoltSdk` / `JoltEncryptedSdk` / `JoltIngressSdk` interfaces stay
the public surface; only their implementation stops hopping through `api.ts`.

### 2. Evict Spoke domain types from the transport layer
Move `SpokePost`, `SpokeProfile`, `SpokeProfileLink`, `SpokeReply`,
`SpokeFeedIndex` into their owning feature `model.ts` files (feed/profile/thread)
or a shared Spoke types module. The transport layer must not import Spoke domain
types; features supply `Decoder<T>` to `read`/`readEncrypted` (already the
pattern).

### 3. Decide `api.ts`'s fate
Either delete `api.ts` outright, or shrink it to a small Spoke-specific shim for
genuinely Spoke-flavoured concerns that are not pure transport
(`assertSpokePath`, `SPOKE_CAPABILITIES`, `makePostPath`/`makeReplyPath`/
`makeThreadPath`, `publishPostWithIndex`). Prefer relocating those into the
features/`src/jolt` config rather than keeping a junk-drawer module.

## Acceptance criteria

- [ ] `src/jolt/` contains the transport implementation; nothing in `src/jolt/`
      imports from `src/api.ts`.
- [ ] No Spoke domain type (`Spoke*`) is declared in or imported by the
      transport layer.
- [ ] Feature code imports transport only through the `JoltSdk` /
      `JoltEncryptedSdk` / `JoltIngressSdk` seam, not raw transport functions.
- [ ] `api.ts` is deleted or reduced to a documented Spoke-only shim.
- [ ] `api.test.ts` moves with the transport (e.g. `src/jolt/transport.test.ts`)
      and still passes; full suite + `yarn build` green.

## Non-goals

- Behavioral change to publishing, resolve, fetch, ingress, or encryption.
- The append-record enumeration swap (that is card 104; its `AppendRecordInfo` ->
  `PostRef` DTO mapping is the enumeration slice of this same ACL work and should
  reuse the relocated transport).
- New schema versions or migrations.

## Notes

- This is a structural refactor: keep it behavior-preserving and lean on the
  existing transport tests (`api.test.ts`) as the safety net, moving them
  alongside the code.
- Sequencing vs 104: do 105 first so 104 builds its enumeration adapter on the
  relocated transport, or fold 104's DTO mapping into 105. Decide when 104 is
  picked up.
