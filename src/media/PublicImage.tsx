import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type { SpokeAttachment } from "../media";
import type { PublicImages } from "./public";

export function PublicImage({
  attachment,
  images,
  expandable = false,
  className = "public-image"
}: {
  attachment: SpokeAttachment;
  images: PublicImages;
  className?: string;
  expandable?: boolean;
}) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const [attempt, retry] = useState(0);
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setUrl("");
    setFailed(false);
    void images.load(attachment).then(
      (blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      },
      () => {
        if (active) setFailed(true);
      }
    );
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [images, attachment.contentId, attempt]);
  if (failed)
    return (
      <div className="media-unavailable">
        <span>Image unavailable</span>
        <button onClick={() => retry((value) => value + 1)}>Retry image</button>
      </div>
    );
  if (!url)
    return (
      <div className="media-loading" role="status">
        Loading image…
      </div>
    );
  const picture = (
    <img
      className={className}
      src={url}
      alt={attachment.alt || "Shared image"}
      onError={() => setFailed(true)}
    />
  );
  if (!expandable) return picture;
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          className="public-image-trigger"
          aria-label={`Open image: ${attachment.alt || "Shared image"}`}
        >
          {picture}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="image-overlay" />
        <Dialog.Content className="image-viewer">
          <Dialog.Title>{attachment.alt || "Shared image"}</Dialog.Title>
          <Dialog.Description className="sr-only">Full size public image.</Dialog.Description>
          <img src={url} alt={attachment.alt || "Shared image"} />
          <Dialog.Close className="icon-button" aria-label="Close image">
            <X size={22} />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
