import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

export type SpokeUpdateAvailable = {
  available: true;
  version: string;
  currentVersion: string;
  notes?: string;
  date?: string;
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

export function shouldShowSpokeUpdateInstall(input: {
  updateCheck: SpokeUpdateCheck | null;
  isDev: boolean;
}) {
  return !input.isDev && input.updateCheck?.available === true;
}

let pendingUpdate: Update | null = null;

export const tauriSpokeUpdateClient: SpokeUpdateClient = {
  async check() {
    const update = await check();
    pendingUpdate = update ?? null;

    if (!update) {
      return { available: false };
    }

    return {
      available: true,
      version: update.version,
      currentVersion: update.currentVersion,
      notes: update.body,
      date: update.date
    };
  },

  async installAndRelaunch() {
    const update = pendingUpdate ?? (await check());
    if (!update) {
      throw new Error("No Spoke update is pending");
    }

    pendingUpdate = null;
    await update.downloadAndInstall();
    await relaunch();
  }
};
