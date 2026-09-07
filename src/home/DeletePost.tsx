import { useState } from "react";
import { AlertDialog } from "radix-ui";
import { apiErrorMessage } from "../jolt";
import type { PostActions, ReadyPost } from "./post-document";
export function DeletePost({
  actions,
  onDeleted
}: {
  actions: PostActions;
  onDeleted(undo: () => Promise<ReadyPost>): void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  async function remove() {
    setPending(true);
    setError("");
    try {
      onDeleted(await actions.remove());
      setOpen(false);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  return (
    <AlertDialog.Root open={open} onOpenChange={setOpen}>
      <AlertDialog.Trigger>Delete post</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="contact-overlay" />
        <AlertDialog.Content className="contact-dialog">
          <AlertDialog.Title>Delete this post?</AlertDialog.Title>
          <AlertDialog.Description>
            It will be removed from your current published posts. Copies already fetched by others
            may remain.
          </AlertDialog.Description>
          {error && <p role="alert">{error}</p>}
          <div className="form-actions">
            <AlertDialog.Cancel disabled={pending}>Keep post</AlertDialog.Cancel>
            <button className="danger-button" disabled={pending} onClick={() => void remove()}>
              Delete post
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
