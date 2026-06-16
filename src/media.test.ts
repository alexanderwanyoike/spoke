import { describe, expect, it } from "vitest";
import {
  attachmentFetchTarget,
  createImageAttachmentReference,
  isSupportedImageMimeType,
  mediaPath,
  validateImageAttachment,
  type SpokeAttachment
} from "./media";

describe("Spoke media helpers", () => {
  it("accepts only supported image MIME types", () => {
    expect(isSupportedImageMimeType("image/jpeg")).toBe(true);
    expect(isSupportedImageMimeType("image/png")).toBe(true);
    expect(isSupportedImageMimeType("image/webp")).toBe(true);
    expect(isSupportedImageMimeType("image/gif")).toBe(false);
  });

  it("validates image size and MIME type before publish", () => {
    expect(() => validateImageAttachment({ type: "image/png", size: 1024 })).not.toThrow();
    expect(() => validateImageAttachment({ type: "image/gif", size: 1024 })).toThrow(
      "Images must be JPEG, PNG, or WebP."
    );
    expect(() => validateImageAttachment({ type: "image/png", size: 0 })).toThrow(
      "Image attachment is empty."
    );
    expect(() => validateImageAttachment({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).toThrow(
      "Image attachments must be 5 MB or smaller."
    );
  });

  it("creates typed attachment references from published media", () => {
    expect(
      createImageAttachmentReference({
        id: "media_1",
        published: {
          content_id: "cid_media",
          size: 2048,
          address: "alice.jolt/spoke/media/media_1"
        },
        mimeType: "image/webp",
        width: 800,
        height: 450,
        alt: "Launch still"
      })
    ).toEqual({
      id: "media_1",
      kind: "image",
      contentId: "cid_media",
      address: "alice.jolt/spoke/media/media_1",
      mimeType: "image/webp",
      size: 2048,
      width: 800,
      height: 450,
      alt: "Launch still"
    });
  });

  it("uses stable media paths and fetch targets", () => {
    const attachment: SpokeAttachment = {
      id: "media_1",
      kind: "image",
      contentId: "cid_media",
      mimeType: "image/jpeg",
      size: 1024
    };

    expect(mediaPath("media_1")).toBe("/spoke/media/media_1");
    expect(attachmentFetchTarget(attachment)).toBe("cid_media");
    expect(attachmentFetchTarget({ ...attachment, contentId: "", address: "alice.jolt/spoke/media/media_1" })).toBe(
      "alice.jolt/spoke/media/media_1"
    );
  });
});
