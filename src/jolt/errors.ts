import { JoltApiError, JoltTransportError } from "jolt-sdk";

export const JOLT_UNAVAILABLE_MESSAGE =
  "Cannot reach the Jolt daemon. Start Jolt Console and make sure the daemon is running.";

export function isJoltUnavailableError(error: unknown) {
  const legacyTauriTransportFailure =
    error instanceof JoltApiError &&
    error.status === undefined &&
    /^(daemon request failed|failed to create daemon HTTP client|daemon response read failed):/.test(
      error.message
    );
  return (
    error instanceof JoltTransportError ||
    error instanceof TypeError ||
    legacyTauriTransportFailure ||
    (error instanceof JoltApiError && (error.status === 500 || error.status === 502))
  );
}
