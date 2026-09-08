Run [Jolt Console](https://github.com/alexanderwanyoike/jolt/releases/latest) before
opening Spoke. Approve Spoke's access request in Console.

## Linux

On Debian, Ubuntu or Linux Mint, download `spoke-amd64.deb` from the
[latest release](https://github.com/alexanderwanyoike/spoke/releases/latest):

```sh
sudo apt install ./spoke-amd64.deb
```

Install each new `.deb` release the same way. It does not self-update.

For the AppImage, use the installer:

```sh
curl -fsSL https://raw.githubusercontent.com/alexanderwanyoike/spoke/main/scripts/install-spoke.sh | bash
```

It installs to `~/.local/bin/spoke`. Run the command again to update, or use
**Updates** inside Spoke.

```sh
curl -fsSL https://raw.githubusercontent.com/alexanderwanyoike/spoke/main/scripts/install-spoke.sh | bash -s -- --check

spoke --appimage-help
```

## macOS and Windows

Download `spoke-aarch64.dmg` for Apple silicon or `spoke-x86_64-setup.exe` for
Windows from the [latest release](https://github.com/alexanderwanyoike/spoke/releases/latest).

The macOS build is not Apple-signed or notarized. If macOS reports that the app is
damaged after you copy it into Applications, clear its quarantine attribute:

```sh
xattr -dr com.apple.quarantine "/Applications/Spoke.app"
```

## In-app updates

Packaged Spoke updates are signed and verified before installation. AppImage,
macOS and Windows builds offer **Updates** in the sidebar. Spoke also checks the
new release's compatibility with your running Jolt node before installing it.

The macOS `.dmg` is the installer; `spoke-aarch64.app.tar.gz` is the updater payload.
Release assets include signatures, SHA-256 checksums and `latest.json` for the updater.
