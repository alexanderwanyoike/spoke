import { useState } from "react";
import { Dialog } from "radix-ui";
import { Download, X } from "lucide-react";
import { apiErrorMessage } from "../jolt";
import { tauriSpokeUpdateClient, type SpokeUpdateClient, type SpokeUpdateCheck } from "./client";

function updateNotice(result: SpokeUpdateCheck): string {
  if (!result.available) {
    if (result.managedByPackage) return "Update Spoke through your package manager.";
    return "Spoke is up to date.";
  }
  if (result.compatibility.status === "incompatible")
    return "Update Jolt before installing this version of Spoke.";
  if (result.compatibility.status === "unavailable")
    return "Start Jolt so Spoke can check update compatibility.";
  return `Update available: ${result.version}`;
}

export function UpdateControl({ client = tauriSpokeUpdateClient }: { client?: SpokeUpdateClient }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [canInstall, setCanInstall] = useState(false);

  async function checkForUpdate() {
    setBusy(true);
    setError("");
    setCanInstall(false);
    try {
      const result = await client.check();
      setNotice(updateNotice(result));
      setCanInstall(result.available && result.compatibility.status === "compatible");
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function installUpdate() {
    setBusy(true);
    setError("");
    try {
      await client.installAndRelaunch();
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root>
      <Dialog.Trigger
        className="rail-link"
        aria-label="Check for updates"
        onClick={() => void checkForUpdate()}
      >
        <Download size={16} />
        <span>Updates</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="contact-overlay" />
        <Dialog.Content className="contact-dialog">
          <Dialog.Close className="icon-button dialog-close" aria-label="Close updates">
            <X size={18} />
          </Dialog.Close>
          <Dialog.Title>Spoke updates</Dialog.Title>
          <Dialog.Description>
            Updates are signed and checked for compatibility with Jolt before installation.
          </Dialog.Description>
          {busy && <p role="status">Working…</p>}
          {notice && <p role="status">{notice}</p>}
          {error && <p role="alert">{error}</p>}
          <div className="contact-actions">
            <button disabled={busy} onClick={() => void checkForUpdate()}>
              Check again
            </button>
            {canInstall && (
              <button
                disabled={busy}
                className="primary-button"
                onClick={() => void installUpdate()}
              >
                Install and restart
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
