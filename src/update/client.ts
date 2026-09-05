import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import {
  decodeAppCompatibilityDeclaration,
  type AppCompatibilityDeclaration,
  type AppCompatibilityResult
} from "jolt-sdk";
import { checkSpokeCompatibility, SPOKE_COMPATIBILITY } from "../jolt";
import { isJoltUnavailableError } from "../jolt/errors";

export type SpokeUpdateCompatibility = AppCompatibilityResult | { status: "unavailable" };

export type SpokeUpdateAvailable = {
  available: true;
  version: string;
  currentVersion: string;
  notes?: string;
  date?: string;
  compatibility: SpokeUpdateCompatibility;
};

export type SpokeUpdateUnavailable = {
  available: false;
  currentVersion?: string;
  // Installed from a system package (.deb, .rpm). The updater only publishes
  // the AppImage on Linux, so these installs update through the package.
  managedByPackage?: boolean;
};

export type SpokeUpdateCheck = SpokeUpdateAvailable | SpokeUpdateUnavailable;

export type SpokeUpdateClient = {
  check(): Promise<SpokeUpdateCheck>;
  installAndRelaunch(): Promise<void>;
};

type PendingSpokeUpdate = {
  update: Update;
  compatibility: SpokeUpdateCompatibility;
};

let pendingUpdate: PendingSpokeUpdate | null = null;

function compatibilityDeclaration(update: Update): AppCompatibilityDeclaration {
  const raw = update.rawJson?.app_compatibility;
  // Manifests published before compatibility metadata use this build's baseline.
  if (raw === undefined) return SPOKE_COMPATIBILITY;

  try {
    return decodeAppCompatibilityDeclaration(raw);
  } catch {
    throw new Error("Spoke update has invalid app_compatibility metadata");
  }
}

async function inspectUpdate(update: Update): Promise<PendingSpokeUpdate> {
  try {
    const compatibility = await checkSpokeCompatibility(compatibilityDeclaration(update), {
      refresh: true
    });
    return { update, compatibility };
  } catch (error) {
    if (isJoltUnavailableError(error)) {
      return { update, compatibility: { status: "unavailable" } };
    }
    throw error;
  }
}

export const tauriSpokeUpdateClient: SpokeUpdateClient = {
  async check() {
    pendingUpdate = null;
    const installKind = await invoke<string>("spoke_install_kind");
    if (installKind === "deb" || installKind === "rpm") {
      return { available: false, managedByPackage: true };
    }
    const update = await check();

    if (!update) {
      return { available: false };
    }
    const inspected = await inspectUpdate(update);
    pendingUpdate = inspected;

    return {
      available: true,
      version: update.version,
      currentVersion: update.currentVersion,
      notes: update.body,
      date: update.date,
      compatibility: inspected.compatibility
    };
  },

  async installAndRelaunch() {
    if (!pendingUpdate) {
      const update = await check();
      pendingUpdate = update ? await inspectUpdate(update) : null;
    }
    if (!pendingUpdate) {
      throw new Error("No Spoke update is pending");
    }
    if (pendingUpdate.compatibility.status === "incompatible") {
      throw new Error("This Spoke update requires newer Jolt App API features");
    }
    if (pendingUpdate.compatibility.status === "unavailable") {
      throw new Error("Cannot verify this Spoke update until Jolt is available");
    }

    const { update } = pendingUpdate;
    pendingUpdate = null;
    await update.downloadAndInstall();
    await relaunch();
  }
};
