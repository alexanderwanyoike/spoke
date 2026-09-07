import { z } from "zod";
import type { Decoder } from "../jolt";

const segment = z
  .string()
  .regex(/^[a-zA-Z0-9_-]+$/)
  .max(200);
export const ReplyBody = z.string().trim().min(1, "Write a reply first.").max(10000);
export const Reply = z.object({
  schema: z.literal("spoke.reply.v2"),
  id: segment,
  postId: segment,
  postAuthor: z.string().min(1),
  parent: segment,
  sender: z.string().min(1),
  body: ReplyBody,
  createdAt: z.iso.datetime({ offset: true }),
  displayName: z.string().max(100).optional()
});
export type Reply = z.infer<typeof Reply>;
export const Acceptance = z.object({
  schema: z.literal("spoke.accepted_reply.v2"),
  postId: segment,
  replyId: segment,
  replyRef: z.object({
    identity: z.string().min(1),
    path: z.string().startsWith("/spoke/replies/")
  }),
  contentId: z.string().min(1),
  acceptedAt: z.iso.datetime({ offset: true })
});
export type Acceptance = z.infer<typeof Acceptance>;
export const ReplyRequest = z.object({
  schema: z.literal("spoke.reply_request.v1"),
  postId: segment,
  replyId: segment,
  sender: z.string().min(1),
  recipient: z.string().min(1)
});
export type ReplyRequest = z.infer<typeof ReplyRequest>;
export type ReplyReview = { ingressId: string; reply: Reply };
export function decoder<T>(schema: z.ZodType<T>): Decoder<T> {
  return (value) => {
    const result = schema.safeParse(value);
    return result.success ? result.data : null;
  };
}
