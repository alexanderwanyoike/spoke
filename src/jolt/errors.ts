import { JoltApiError, JoltTransportError } from "jolt-sdk";

export const JOLT_UNAVAILABLE_MESSAGE =
  "Cannot reach the Jolt daemon. Start Jolt Console and make sure the daemon is running.";

export function isJoltUnavailableError(error: unknown) {
  // The desktop host reports both transport failures and local client
  // configuration failures here: neither can establish a daemon connection.
  // Keep matching the legacy message form for older Jolt hosts as well.
  const desktopHostConnectionFailure =
    error instanceof JoltApiError &&
    error.status === undefined &&
    /^(daemon request failed|failed to create daemon HTTP client|daemon response read failed):/.test(
      error.message
    );
  return (
    error instanceof JoltTransportError ||
    error instanceof TypeError ||
    desktopHostConnectionFailure ||
    (error instanceof JoltApiError && (error.status === 500 || error.status === 502))
  );
}
