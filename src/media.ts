export const IMAGE_ATTACHMENT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export type ImageAttachmentMimeType = (typeof IMAGE_ATTACHMENT_MIME_TYPES)[number];

export type SpokeAttachment = {
  id: string;
  kind: "image";
  contentId: string;
  address?: string | null;
  mimeType: ImageAttachmentMimeType;
  size: number;
  width?: number;
  height?: number;
  alt?: string;
};

export type SpokeMessageAttachment = SpokeAttachment & {
  encrypted: true;
  path?: string | null;
};

export type AttachmentSource = {
  type: string;
  size: number;
};

export type PublishedAttachment = {
  content_id: string;
  size: number;
  path?: string | null;
  address?: string | null;
};

export function isSupportedImageMimeType(mimeType: string): mimeType is ImageAttachmentMimeType {
  return IMAGE_ATTACHMENT_MIME_TYPES.includes(mimeType as ImageAttachmentMimeType);
}

export function validateImageAttachment(source: AttachmentSource) {
  if (!isSupportedImageMimeType(source.type)) {
    throw new Error("Images must be JPEG, PNG, or WebP.");
  }
  if (source.size <= 0) {
    throw new Error("Image attachment is empty.");
  }
  if (source.size > MAX_IMAGE_ATTACHMENT_BYTES) {
    throw new Error("Image attachments must be 5 MB or smaller.");
  }
}

export function mediaPath(id: string) {
  return `/spoke/media/${id}`;
}

export function messageMediaPath(messageId: string, attachmentId: string) {
  return `/spoke/messages/media/${messageId}/${attachmentId}`;
}

export function attachmentFetchTarget(attachment: SpokeAttachment) {
  return attachment.address || attachment.contentId;
}

export function createImageAttachmentReference(input: {
  id: string;
  published: PublishedAttachment;
  mimeType: ImageAttachmentMimeType;
  width?: number;
  height?: number;
  alt?: string;
}): SpokeAttachment {
  return {
    id: input.id,
    kind: "image",
    contentId: input.published.content_id,
    address: input.published.address,
    mimeType: input.mimeType,
    size: input.published.size,
    width: input.width,
    height: input.height,
    alt: input.alt
  };
}

export function createEncryptedImageAttachmentReference(input: {
  id: string;
  published: PublishedAttachment;
  mimeType: ImageAttachmentMimeType;
  width?: number;
  height?: number;
  alt?: string;
}): SpokeMessageAttachment {
  return {
    ...createImageAttachmentReference(input),
    encrypted: true,
    path: input.published.path
  };
}
