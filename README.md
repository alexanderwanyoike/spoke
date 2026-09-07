# Spoke

Spoke is a social application built on [Jolt](https://github.com/alexanderwanyoike/jolt).
This branch replaces its application shell with the first functional Messages slice:
private contact requests, one-to-one text and image messages, and encrypted history.
Posts, feeds and the other screens will return as subsequent replacement slices.

Spoke requests scoped capabilities from the local daemon. The user approves or
revokes access in Jolt Console; Spoke never receives the identity's private key.
Contacts and messages use application-owned schemas under `/spoke/*`, above Jolt's
generic encrypted publication and recipient-controlled ingress APIs.

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

Packaged Spoke builds offer **Updates** in the sidebar to check GitHub Releases
for signed in-app updates. Installing the update verifies the updater signature, applies the
platform update payload, and relaunches Spoke. Before installation, Spoke
checks the release's App API declaration against the reachable Jolt daemon. An
incompatible or unverifiable release leaves the currently installed Spoke
build untouched.

At startup, Spoke checks the same app-owned declaration before mounting its
session or social runtime. A reachable incompatible daemon gets a retryable,
non-mutating recovery screen; an unreachable daemon is reported as unavailable,
not as requiring an upgrade.

## Desktop Development

```sh
yarn install --frozen-lockfile
yarn desktop:dev
```

Build the Linux AppImage:

```sh
yarn desktop:build
```

The AppImage is written to:

```text
src-tauri/target/release/bundle/appimage/Spoke_0.1.0_amd64.AppImage
```

For web development:

```sh
yarn dev
```

The Vite dev server listens on `http://127.0.0.1:5178` and proxies the local daemon from `VITE_JOLT_DAEMON_URL` or `http://127.0.0.1:9862`.

## Release Packaging

CI builds Linux AppImage, macOS DMG, and Windows NSIS artifacts for pull
requests and publishes release assets for tags:

```text
spoke-x86_64.AppImage
spoke-x86_64.AppImage.sha256
spoke-x86_64.AppImage.sig
spoke-amd64.deb
spoke-amd64.deb.sha256
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

On Debian, Ubuntu, and Linux Mint the `.deb` is the recommended install. It
registers the applications-menu entry and icon that a bare AppImage cannot,
and it uses the system GTK and GLib instead of bundled copies:

```bash
sudo apt install ./spoke-amd64.deb
```

The `.deb` does not self-update; install the next release the same way. The
AppImage remains the self-updating build and the path the install script uses.

Packaged Spoke updates are signed and verified before installation. Spoke uses
its own updater key, separate from Jolt Console and Pastey.

## Verify Messages

```sh
./scripts/test-local.sh
JOLT_BINARY=/absolute/path/to/jolt yarn test:integration
```

The integration harness starts two isolated real Jolt nodes, requests and accepts
contact access, exchanges text and an image, and reopens encrypted history. It
requires a compatible Jolt binary (verified with 0.5.3). It does not use personal
identities or the user's running daemon.

For manual use, connect Spoke to Jolt, approve access in Console, then choose
**New conversation** to send a contact request. The recipient accepts it in their
Spoke instance before either side sends messages. The application at `/` is the
production entry; no fictional development entry is included.
