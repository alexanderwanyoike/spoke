import { useState } from "react";
import { validateImageAttachment } from "../media";
import type { PostPhoto } from "./input";
export function usePostPhotos() {
  const [photos, setPhotos] = useState<PostPhoto[]>([]);
  return {
    photos,
    add(files: File[]) {
      if (photos.length + files.length > 6) throw new Error("Choose up to six images.");
      files.forEach(validateImageAttachment);
      setPhotos((current) => [...current, ...files.map((file) => ({ file, alt: "" }))]);
    },
    describe(index: number, alt: string) {
      setPhotos((items) =>
        items.map((item, position) => (position === index ? { ...item, alt } : item))
      );
    },
    remove(index: number) {
      setPhotos((items) => items.filter((_, position) => position !== index));
    },
    move(index: number, direction: number) {
      const next = index + direction;
      if (next < 0 || next >= photos.length) return;
      const ordered = [...photos];
      [ordered[index], ordered[next]] = [ordered[next], ordered[index]];
      setPhotos(ordered);
    }
  };
}
