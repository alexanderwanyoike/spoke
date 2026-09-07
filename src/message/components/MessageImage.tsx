import { useEffect, useState } from "react";
import { Dialog } from "radix-ui";
import { X, ImageOff } from "lucide-react";
import { apiErrorMessage } from "../../jolt";
import type { SpokeMessageAttachment } from "../../media";
import { useMessagesServices } from "../context";

type ImageState =
  { kind: "loading" } | { kind: "ready"; url: string } | { kind: "error"; error: string };
export function MessageImage({ attachment }: { attachment: SpokeMessageAttachment }) {
  const { gateway } = useMessagesServices();
  const [state, setState] = useState<ImageState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let url: string | undefined;
    setState({ kind: "loading" });
    gateway
      .loadImage(attachment)
      .then((blob) => {
        if (!active) return;
        url = URL.createObjectURL(blob);
        setState({ kind: "ready", url });
      })
      .catch((cause) => {
        if (active) setState({ kind: "error", error: apiErrorMessage(cause) });
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [gateway, attachment.contentId, attempt]);
  if (state.kind === "loading")
    return (
      <div className="image-placeholder" role="status">
        Loading image…
      </div>
    );
  if (state.kind === "error")
    return (
      <div className="image-placeholder">
        <ImageOff size={22} />
        <p>Image unavailable</p>
        <small>{state.error}</small>
        <button onClick={() => setAttempt((value) => value + 1)}>Try again</button>
      </div>
    );
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          className="message-image"
          aria-label={`Open image: ${attachment.alt || "Image attachment"}`}
        >
          <img
            src={state.url}
            alt={attachment.alt || "Image attachment"}
            loading="lazy"
            onError={() => setState({ kind: "error", error: "This image could not be displayed." })}
          />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="image-overlay" />
        <Dialog.Content className="image-viewer">
          <Dialog.Title>{attachment.alt || "Image attachment"}</Dialog.Title>
          <Dialog.Description className="sr-only">
            Full size image shared in this conversation.
          </Dialog.Description>
          <img src={state.url} alt={attachment.alt || "Image attachment"} />
          <Dialog.Close className="icon-button" aria-label="Close image">
            <X size={22} />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
