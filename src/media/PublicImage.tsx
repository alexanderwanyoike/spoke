import { useEffect, useState } from "react";
import type { SpokeAttachment } from "../media";
import type { PublicImages } from "./public";

export function PublicImage({
  attachment,
  images,
  className = "public-image"
}: {
  attachment: SpokeAttachment;
  images: PublicImages;
  className?: string;
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
  return (
    <img
      className={className}
      src={url}
      alt={attachment.alt || "Shared image"}
      onError={() => setFailed(true)}
    />
  );
}
