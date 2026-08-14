import type { AppCompatibilityResult } from "jolt-sdk";
import { checkSpokeCompatibility, SPOKE_COMPATIBILITY } from "./jolt";
import { isJoltUnavailableError } from "./jolt/errors";

export type SpokeStartupCompatibility =
  | AppCompatibilityResult
  | { status: "unavailable" };

export async function enterSpokeRuntime(
  continueStartup: (compatibility: AppCompatibilityResult) => Promise<void>
): Promise<SpokeStartupCompatibility> {
  try {
    const compatibility = await checkSpokeCompatibility(SPOKE_COMPATIBILITY, { refresh: true });
    if (compatibility.status === "compatible") {
      await continueStartup(compatibility);
    }
    return compatibility;
  } catch (error) {
    if (isJoltUnavailableError(error)) {
      return { status: "unavailable" };
    }
    throw error;
  }
}
