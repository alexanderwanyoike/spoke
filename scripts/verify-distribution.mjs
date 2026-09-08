import { readFileSync } from "node:fs";

const files = {
  workflow: readFileSync(".github/workflows/package-spoke.yml", "utf8"),
  installer: readFileSync("scripts/install-spoke.sh", "utf8"),
  packageScript: readFileSync("scripts/package-spoke.sh", "utf8"),
  normalizeArtifacts: readFileSync("scripts/normalize-spoke-artifacts.sh", "utf8"),
  assembleRelease: readFileSync("scripts/assemble-spoke-release.sh", "utf8"),
  updateManifest: readFileSync("scripts/write-spoke-update-manifest.mjs", "utf8"),
  compatibility: readFileSync("spoke-compatibility.json", "utf8"),
  tauriConfig: readFileSync("src-tauri/tauri.conf.json", "utf8"),
  tauriCargo: readFileSync("src-tauri/Cargo.toml", "utf8"),
  tauriLib: readFileSync("src-tauri/src/lib.rs", "utf8"),
  tauriCapability: readFileSync("src-tauri/capabilities/default.json", "utf8"),
  packageJson: readFileSync("package.json", "utf8"),
  app: readFileSync("src/update/UpdateControl.tsx", "utf8"),
  updateClient: readFileSync("src/update/client.ts", "utf8"),
  readme: readFileSync("README.md", "utf8"),
  installation: readFileSync("docs/installation.md", "utf8")
};

const requiredMarkers = {
  workflow: [
    "Package Spoke",
    "matrix:",
    "ubuntu-22.04",
    "macos-latest",
    "windows-latest",
    "scripts/package-spoke.sh",
    "scripts/normalize-spoke-artifacts.sh",
    "scripts/assemble-spoke-release.sh",
    "shell: bash",
    "spoke-x86_64.AppImage",
    "spoke-amd64.deb",
    "spoke-aarch64.dmg",
    "spoke-aarch64.app.tar.gz",
    "spoke-x86_64-setup.exe",
    "write-spoke-update-manifest.mjs",
    "softprops/action-gh-release",
    "refs/tags/",
    "spoke-compatibility.json"
  ],
  installer: [
    "SPOKE_VERSION",
    "SPOKE_INSTALL_DIR",
    "spoke-x86_64.AppImage",
    "releases/latest",
    "releases/download",
    "--check",
    "--update",
    "--force",
    "--dry-run"
  ],
  packageScript: [
    "target/release/bundle/appimage",
    "target/release/bundle/dmg",
    "target/release/bundle/macos",
    "target/release/bundle/nsis",
    "appimage,deb",
    "BUNDLE_KIND",
    "--bundle",
    "SPOKE_CREATE_UPDATER_ARTIFACTS",
    "createUpdaterArtifacts",
    "app,dmg",
    "Prefetching Tauri AppImage helper binaries"
  ],
  normalizeArtifacts: [
    "Normalize Spoke package artifacts",
    "--bundle",
    "appimage",
    "linux",
    "dmg",
    "nsis",
    "--deb-asset",
    "target/release/bundle/appimage",
    "target/release/bundle/deb",
    "target/release/bundle/dmg",
    "target/release/bundle/macos",
    "target/release/bundle/nsis",
    "SPOKE_REQUIRE_UPDATER_ARTIFACTS",
    "sha256sum",
    "shasum -a 256"
  ],
  assembleRelease: [
    "Assemble normalized Spoke artifacts",
    "spoke-x86_64.AppImage",
    "spoke-x86_64.AppImage.sha256",
    "spoke-x86_64.AppImage.sig",
    "spoke-amd64.deb",
    "spoke-amd64.deb.sha256",
    "spoke-aarch64.dmg",
    "spoke-aarch64.dmg.sha256",
    "spoke-aarch64.app.tar.gz",
    "spoke-aarch64.app.tar.gz.sha256",
    "spoke-aarch64.app.tar.gz.sig",
    "spoke-x86_64-setup.exe",
    "spoke-x86_64-setup.exe.sha256",
    "spoke-x86_64-setup.exe.sig",
    "write-spoke-update-manifest.mjs",
    "latest.json",
    "linux-x86_64",
    "darwin-aarch64",
    "windows-x86_64"
  ],
  updateManifest: [
    "latest.json",
    "app_compatibility",
    "spoke-compatibility.json",
    "linux-x86_64",
    "darwin-aarch64",
    "windows-x86_64",
    "signature",
    "spoke-x86_64.AppImage",
    "spoke-aarch64.app.tar.gz",
    "spoke-x86_64-setup.exe"
  ],
  compatibility: ["app_api", "required_features", "optional_features"],
  tauriConfig: [
    "icons/icon.png",
    "icons/icon.ico",
    '"appimage", "deb"',
    '"updater"',
    '"pubkey"',
    "https://github.com/alexanderwanyoike/spoke/releases/latest/download/latest.json"
  ],
  tauriCargo: ["tauri-plugin-updater", "tauri-plugin-process", "tauri-plugin-jolt"],
  tauriLib: [
    "tauri_plugin_updater::Builder",
    "tauri_plugin_process::init",
    "tauri_plugin_jolt::init"
  ],
  tauriCapability: ["jolt:default"],
  packageJson: ["@tauri-apps/plugin-updater", "@tauri-apps/plugin-process", "jolt-sdk"],
  app: ["client.check()", "client.installAndRelaunch()", "Update available"],
  updateClient: ["check()", "downloadAndInstall", "relaunch"],
  readme: ["docs/installation.md", "Jolt Console", "releases/latest/download/spoke-amd64.deb"],
  installation: [
    "curl -fsSL",
    "scripts/install-spoke.sh",
    "Jolt Console",
    "Packaged Spoke updates are signed and verified before installation",
    "spoke --appimage-help",
    "spoke-aarch64.dmg",
    "spoke-aarch64.app.tar.gz",
    "spoke-x86_64-setup.exe",
    "xattr -dr com.apple.quarantine"
  ]
};

for (const [fileName, markers] of Object.entries(requiredMarkers)) {
  for (const marker of markers) {
    if (!files[fileName].includes(marker)) {
      throw new Error(`Missing Spoke distribution marker in ${fileName}: ${marker}`);
    }
  }
}

console.log("Spoke distribution contract verified");
