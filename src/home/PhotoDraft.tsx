import { useEffect, useState } from "react";
import type { PostPhoto } from "./input";
export function PhotoDraft({
  photo,
  onAlt,
  onRemove,
  onMove
}: {
  photo: PostPhoto;
  onAlt(alt: string): void;
  onRemove(): void;
  onMove(direction: number): void;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(photo.file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [photo.file]);
  return (
    <div className="post-photo-draft">
      <img src={url} alt="Selected image preview" />
      <div>
        <label className="field">
          <span>Description of {photo.file.name}</span>
          <input value={photo.alt} onChange={(event) => onAlt(event.target.value)} />
        </label>
        <div className="photo-actions">
          <button type="button" onClick={() => onMove(-1)}>
            Move earlier
          </button>
          <button type="button" onClick={() => onMove(1)}>
            Move later
          </button>
          <button type="button" onClick={onRemove}>
            Remove image
          </button>
        </div>
      </div>
    </div>
  );
}
