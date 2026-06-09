import { readFileSync } from "node:fs";

const files = {
  workflow: readFileSync(".github/workflows/package-spoke.yml", "utf8"),
  installer: readFileSync("scripts/install-spoke.sh", "utf8"),
  packageScript: readFileSync("scripts/package-spoke.sh", "utf8"),
  updateManifest: readFileSync("scripts/write-spoke-update-manifest.mjs", "utf8"),
  tauriConfig: readFileSync("src-tauri/tauri.conf.json", "utf8"),
  tauriCargo: readFileSync("src-tauri/Cargo.toml", "utf8"),
  tauriLib: readFileSync("src-tauri/src/lib.rs", "utf8"),
  packageJson: readFileSync("package.json", "utf8"),
  app: readFileSync("src/App.tsx", "utf8"),
  updateClient: readFileSync("src/update/client.ts", "utf8"),
  readme: readFileSync("README.md", "utf8")
};

const requiredMarkers = {
  workflow: [
    "Package Spoke",
    "scripts/package-spoke.sh",
    "spoke-x86_64.AppImage",
    "spoke-x86_64.AppImage.sig",
    "latest.json",
    "write-spoke-update-manifest.mjs",
    "softprops/action-gh-release"
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
    "SPOKE_CREATE_UPDATER_ARTIFACTS",
    "createUpdaterArtifacts",
    "Prefetching Tauri AppImage helper binaries"
  ],
  updateManifest: [
    "latest.json",
    "linux-x86_64",
    "signature",
    "spoke-x86_64.AppImage"
  ],
  tauriConfig: [
    "\"updater\"",
    "\"pubkey\"",
    "https://github.com/alexanderwanyoike/spoke/releases/latest/download/latest.json"
  ],
  tauriCargo: ["tauri-plugin-updater", "tauri-plugin-process"],
  tauriLib: ["tauri_plugin_updater::Builder", "tauri_plugin_process::init"],
  packageJson: ["@tauri-apps/plugin-updater", "@tauri-apps/plugin-process"],
  app: ["checkSpokeUpdate", "installSpokeUpdate", "Update available"],
  updateClient: ["check()", "downloadAndInstall", "relaunch"],
  readme: [
    "curl -fsSL",
    "scripts/install-spoke.sh",
    "Jolt Console",
    "Packaged Spoke updates are signed and verified before installation",
    "spoke --appimage-help"
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
