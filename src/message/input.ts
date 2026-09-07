import { z } from "zod";
import { makeId } from "../jolt";
import { isSupportedImageMimeType, validateImageAttachment } from "../media";
import type { DraftImage } from "./drafts";

export const MessageInput = z
  .object({
    body: z.string().max(10_000, "Keep messages under 10,000 characters."),
    images: z.array(z.custom<DraftImage>()).max(4, "Attach up to four images.")
  })
  .refine((value) => value.body.trim().length > 0 || value.images.length > 0, {
    path: ["body"],
    message: "Write a message or attach an image."
  });

export function prepareImages(files: File[], existingCount: number): DraftImage[] {
  if (files.length + existingCount > 4) throw new Error("Attach up to four images.");
  files.forEach(validateImageAttachment);
  return files.map((file) => {
    if (!isSupportedImageMimeType(file.type)) throw new Error("Unsupported image.");
    return {
      id: makeId("image"),
      file,
      mimeType: file.type,
      alt: "",
      previewUrl: URL.createObjectURL(file)
    };
  });
}
