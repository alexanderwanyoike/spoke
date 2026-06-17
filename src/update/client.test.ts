import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { shouldShowSpokeUpdateInstall, tauriSpokeUpdateClient } from "./client";

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn()
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn()
}));

describe("tauriSpokeUpdateClient", () => {
  beforeEach(() => {
    vi.mocked(check).mockReset();
    vi.mocked(relaunch).mockReset();
  });

  it("reports no update when the Tauri updater returns none", async () => {
    vi.mocked(check).mockResolvedValueOnce(null);

    await expect(tauriSpokeUpdateClient.check()).resolves.toEqual({ available: false });
  });

  it("installs the pending signed update and relaunches Spoke", async () => {
    const update = {
      version: "0.2.0",
      currentVersion: "0.1.0",
      body: "Release notes",
      date: "2026-06-09T12:00:00Z",
      downloadAndInstall: vi.fn(async () => undefined)
    };
    vi.mocked(check).mockResolvedValueOnce(update as never);

    await expect(tauriSpokeUpdateClient.check()).resolves.toEqual({
      available: true,
      version: "0.2.0",
      currentVersion: "0.1.0",
      notes: "Release notes",
      date: "2026-06-09T12:00:00Z"
    });

    await tauriSpokeUpdateClient.installAndRelaunch();

    expect(update.downloadAndInstall).toHaveBeenCalledOnce();
    expect(relaunch).toHaveBeenCalledOnce();
  });
});

describe("shouldShowSpokeUpdateInstall", () => {
  it("hides the install action in local dev builds", () => {
    expect(
      shouldShowSpokeUpdateInstall({
        updateCheck: {
          available: true,
          version: "0.2.0",
          currentVersion: "0.1.0"
        },
        isDev: true
      })
    ).toBe(false);
  });

  it("shows the install action for available updates outside local dev", () => {
    expect(
      shouldShowSpokeUpdateInstall({
        updateCheck: {
          available: true,
          version: "0.2.0",
          currentVersion: "0.1.0"
        },
        isDev: false
      })
    ).toBe(true);
  });
});
