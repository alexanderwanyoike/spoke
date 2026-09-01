import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { JoltTransportError } from "jolt-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tauriSpokeUpdateClient } from "./client";

const checkSpokeCompatibility = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn()
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn()
}));

vi.mock("../jolt", () => ({
  SPOKE_COMPATIBILITY: {
    appApi: 1,
    requiredFeatures: {},
    optionalFeatures: {}
  },
  checkSpokeCompatibility
}));

describe("tauriSpokeUpdateClient", () => {
  beforeEach(() => {
    vi.mocked(check).mockReset();
    vi.mocked(relaunch).mockReset();
    checkSpokeCompatibility.mockReset();
    checkSpokeCompatibility.mockResolvedValue({ status: "compatible" });
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

    await expect(tauriSpokeUpdateClient.check()).resolves.toMatchObject({
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

  it("keeps an incompatible signed update pending without downloading it", async () => {
    const update = {
      version: "0.3.0",
      currentVersion: "0.2.0",
      rawJson: {
        app_compatibility: {
          app_api: 1,
          required_features: { "data.tombstones": 1 },
          optional_features: {}
        }
      },
      downloadAndInstall: vi.fn(async () => undefined)
    };
    vi.mocked(check).mockResolvedValueOnce(update as never);
    checkSpokeCompatibility.mockResolvedValue({ status: "incompatible" });

    await expect(tauriSpokeUpdateClient.check()).resolves.toMatchObject({
      available: true,
      compatibility: { status: "incompatible" }
    });
    expect(checkSpokeCompatibility).toHaveBeenCalledWith(
      {
        appApi: 1,
        requiredFeatures: { "data.tombstones": 1 },
        optionalFeatures: {}
      },
      { refresh: true }
    );

    await expect(tauriSpokeUpdateClient.installAndRelaunch()).rejects.toThrow(
      "This Spoke update requires newer Jolt App API features"
    );
    expect(update.downloadAndInstall).not.toHaveBeenCalled();
    expect(relaunch).not.toHaveBeenCalled();
  });

  it("keeps Jolt unavailability distinct from an incompatible update", async () => {
    const update = {
      version: "0.3.0",
      currentVersion: "0.2.0",
      rawJson: {
        app_compatibility: {
          app_api: 1,
          required_features: {},
          optional_features: {}
        }
      },
      downloadAndInstall: vi.fn(async () => undefined)
    };
    vi.mocked(check).mockResolvedValueOnce(update as never);
    checkSpokeCompatibility.mockRejectedValue(
      new JoltTransportError("Cannot reach the Jolt daemon")
    );

    await expect(tauriSpokeUpdateClient.check()).resolves.toMatchObject({
      available: true,
      compatibility: { status: "unavailable" }
    });
    await expect(tauriSpokeUpdateClient.installAndRelaunch()).rejects.toThrow(
      "Cannot verify this Spoke update until Jolt is available"
    );
    expect(update.downloadAndInstall).not.toHaveBeenCalled();
    expect(relaunch).not.toHaveBeenCalled();
  });

  it("does not weaken malformed compatibility metadata", async () => {
    const update = {
      version: "0.4.0",
      currentVersion: "0.3.0",
      rawJson: {
        app_compatibility: {
          app_api: "2",
          required_features: {},
          optional_features: {}
        }
      },
      downloadAndInstall: vi.fn(async () => undefined)
    };
    vi.mocked(check).mockResolvedValue(update as never);

    await expect(tauriSpokeUpdateClient.check()).rejects.toThrow(
      "Spoke update has invalid app_compatibility metadata"
    );
    await expect(tauriSpokeUpdateClient.installAndRelaunch()).rejects.toThrow(
      "Spoke update has invalid app_compatibility metadata"
    );
    expect(update.downloadAndInstall).not.toHaveBeenCalled();
    expect(relaunch).not.toHaveBeenCalled();
  });

  it("does not treat present primitive compatibility metadata as absent", async () => {
    const update = {
      version: "0.4.0",
      currentVersion: "0.3.0",
      rawJson: { app_compatibility: "invalid" },
      downloadAndInstall: vi.fn(async () => undefined)
    };
    vi.mocked(check).mockResolvedValue(update as never);

    await expect(tauriSpokeUpdateClient.check()).rejects.toThrow(
      "Spoke update has invalid app_compatibility metadata"
    );
    expect(checkSpokeCompatibility).not.toHaveBeenCalled();
    expect(update.downloadAndInstall).not.toHaveBeenCalled();
    expect(relaunch).not.toHaveBeenCalled();
  });
});
