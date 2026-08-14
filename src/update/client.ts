import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import type { AppCompatibilityDeclaration, AppCompatibilityResult } from "jolt-sdk";
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

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function compatibilityDeclaration(update: Update): AppCompatibilityDeclaration {
  const raw = update.rawJson?.app_compatibility;
  // Manifests published before compatibility metadata use this build's baseline.
  if (!raw || typeof raw !== "object") return SPOKE_COMPATIBILITY;

  const declaration = raw as {
    app_api?: unknown;
    required_features?: unknown;
    optional_features?: unknown;
  };
  const validFeatureMap = (value: unknown): value is Record<string, number> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    return Object.values(value).every(isPositiveInteger);
  };
  if (
    !isPositiveInteger(declaration.app_api) ||
    !validFeatureMap(declaration.required_features) ||
    !validFeatureMap(declaration.optional_features)
  ) {
    throw new Error("Spoke update has invalid app_compatibility metadata");
  }
  return {
    appApi: declaration.app_api,
    requiredFeatures: declaration.required_features,
    optionalFeatures: declaration.optional_features
  };
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
