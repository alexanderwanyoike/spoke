import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

describe("write-spoke-update-manifest", () => {
  let workDir: string | null = null;

  afterEach(() => {
    if (workDir) rmSync(workDir, { recursive: true, force: true });
    workDir = null;
  });

  it("declares the Jolt App API contract required by the release", () => {
    workDir = mkdtempSync(join(tmpdir(), "spoke-update-manifest-"));
    const signaturePath = join(workDir, "spoke.sig");
    const manifestPath = join(workDir, "latest.json");
    writeFileSync(signaturePath, "signed-update");

    execFileSync(
      process.execPath,
      ["scripts/write-spoke-update-manifest.mjs", "v0.2.0", signaturePath, manifestPath],
      { cwd: process.cwd() }
    );

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.app_compatibility).toEqual({
      app_api: 1,
      required_features: {
        "data.records": 5,
        "data.subscriptions": 1,
        "data.change-streams": 1,
      },
      optional_features: {}
    });
  });
});
