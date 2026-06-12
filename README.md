# Spoke

Spoke is a small Jolt social PoC for known identities. It keeps social concepts in app-owned JSON objects under `/spoke/*`:

- `/spoke/profile` for the local display profile
- `/spoke/posts/{id}` for public posts
- `/spoke/feed` for the app-level feed index
- `/spoke/outgoing/{id}` for encrypted outbound reply envelopes
- `/spoke/replies/{id}` for accepted incoming replies

## Run

Spoke is desktop-first. Run Jolt Console first and let it start the local Jolt
daemon, then open Spoke and approve Spoke's app session in Console.

Install or update Spoke from tagged Linux releases:

```sh
curl -fsSL https://raw.githubusercontent.com/alexanderwanyoike/spoke/main/scripts/install-spoke.sh | bash
```

The installer downloads `spoke-x86_64.AppImage` to:

```text
~/.local/bin/spoke
```

Check whether a newer release exists:

```sh
curl -fsSL https://raw.githubusercontent.com/alexanderwanyoike/spoke/main/scripts/install-spoke.sh | bash -s -- --check
```

Install a specific version:

```sh
curl -fsSL https://raw.githubusercontent.com/alexanderwanyoike/spoke/main/scripts/install-spoke.sh | SPOKE_VERSION=v0.1.0 bash
```

Check the installed AppImage:

```sh
spoke --appimage-help
```

macOS and Windows builds are distributed as release assets:

```text
spoke-aarch64.dmg
spoke-x86_64-setup.exe
```

Download the DMG or Windows installer from the latest GitHub Release. The macOS
DMG currently is not Apple-signed or notarized. If macOS says Spoke is damaged
and cannot be opened after copying it to Applications, clear the quarantine
attribute:

```sh
xattr -dr com.apple.quarantine "/Applications/Spoke.app"
```

Packaged Spoke builds also check GitHub Releases for signed in-app updates.
When a newer signed release is available, Spoke shows an update action in the
top bar. Installing the update verifies the updater signature, applies the
platform update payload, and relaunches Spoke.

## Desktop Development

```sh
npm install
npm run desktop:dev
```

Build the Linux AppImage:

```sh
npm run desktop:build
```

The AppImage is written to:

```text
src-tauri/target/release/bundle/appimage/Spoke_0.1.0_amd64.AppImage
```

For web development:

```sh
npm run dev
```

The Vite dev server listens on `http://127.0.0.1:5178` and proxies the local daemon from `VITE_JOLT_DAEMON_URL` or `http://127.0.0.1:9862`.

## Release Packaging

CI builds Linux AppImage, macOS DMG, and Windows NSIS artifacts for pull
requests and publishes release assets for tags:

```text
spoke-x86_64.AppImage
spoke-x86_64.AppImage.sha256
spoke-x86_64.AppImage.sig
spoke-aarch64.dmg
spoke-aarch64.dmg.sha256
spoke-aarch64.app.tar.gz
spoke-aarch64.app.tar.gz.sha256
spoke-aarch64.app.tar.gz.sig
spoke-x86_64-setup.exe
spoke-x86_64-setup.exe.sha256
spoke-x86_64-setup.exe.sig
latest.json
```

Packaged Spoke updates are signed and verified before installation. Spoke uses
its own updater key, separate from Jolt Console and Pastey.

## Local demo shape

1. Start a Jolt daemon and Jolt Console.
2. Open Spoke and request app access.
3. Approve the Spoke session in Console.
4. Publish a profile and a post.
5. Add a known contact by `.jolt` identity.
6. Refresh the feed and send an encrypted reply to a contact post.
7. On the recipient Spoke instance, refresh Incoming, open the ingress item, then accept or reject it.

The current reply flow uses existing daemon APIs only: Spoke encrypts and publishes an outgoing object under the sender's `/spoke/outgoing/*`, fetches the encrypted bytes by CID, then submits those bytes to the recipient daemon `/api/v1/ingress`.
