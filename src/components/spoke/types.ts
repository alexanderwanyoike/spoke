import type { ReactNode } from "react";
import type { Contact } from "@/feed";
import type { Conversation } from "@/message";
import type { ImageAttachmentMimeType } from "@/media";

export type AvatarSize = "small" | "large";

export type AvatarRenderer = (identity: string, size?: AvatarSize) => ReactNode;

export type PendingImageAttachment = {
  id: string;
  file: File;
  previewUrl: string;
  mimeType: ImageAttachmentMimeType;
  width?: number;
  height?: number;
  alt: string;
};

export type MessageThread = {
  id: string;
  contact: Contact;
  conversation?: Conversation;
  lastMessageAt?: string;
};
