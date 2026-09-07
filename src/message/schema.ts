import { z } from "zod";
import { IMAGE_ATTACHMENT_MIME_TYPES } from "../media";

const EncryptedImage = z.object({
  id: z.string().min(1),
  kind: z.literal("image"),
  contentId: z.string().min(1),
  address: z.string().nullable().optional(),
  mimeType: z.enum(IMAGE_ATTACHMENT_MIME_TYPES),
  size: z.number().nonnegative(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  alt: z.string().optional(),
  encrypted: z.literal(true),
  path: z.string().nullable().optional()
});

export const MessageRecord = z.object({
  schema: z.enum(["spoke.message.v1", "spoke.message.v2"]),
  id: z.string().min(1),
  conversationId: z.string().min(1),
  sender: z.string().min(1),
  recipients: z.array(z.string().min(1)).length(1),
  body: z.string(),
  createdAt: z.string().datetime({ offset: true }),
  attachments: z.array(EncryptedImage).optional()
});
