import { ImagePlus, X } from "lucide-react";
import { useRef } from "react";
import type { DraftImage } from "../drafts";

export function ImagePicker({ onPick }: { onPick(files: File[]): void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        className="sr-only"
        type="file"
        aria-label="Attach images"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(event) => {
          onPick(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <button
        className="icon-button"
        type="button"
        aria-label="Choose images"
        onClick={() => input.current?.click()}
      >
        <ImagePlus size={19} />
      </button>
    </>
  );
}

export function DraftImages({
  images,
  onChange
}: {
  images: DraftImage[];
  onChange(images: DraftImage[]): void;
}) {
  return (
    <div className="draft-images">
      {images.map((image) => (
        <div className="draft-image" key={image.id}>
          <img src={image.previewUrl} alt={image.alt || image.file.name} />
          <button
            type="button"
            className="icon-button"
            aria-label={`Remove ${image.file.name}`}
            onClick={() => onChange(images.filter((item) => item.id !== image.id))}
          >
            <X size={14} />
          </button>
          <input
            aria-label={`Description for ${image.file.name}`}
            placeholder="Add a description"
            value={image.alt}
            onChange={(event) =>
              onChange(
                images.map((item) =>
                  item.id === image.id ? { ...item, alt: event.target.value } : item
                )
              )
            }
          />
        </div>
      ))}
    </div>
  );
}
