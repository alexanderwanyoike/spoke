import { z } from "zod";
export const PostInput = z.object({
  body: z.string().trim().max(10000),
  title: z.string().trim().max(200),
  website: z
    .string()
    .trim()
    .refine((value) => {
      if (!value) return true;
      try {
        return ["http:", "https:"].includes(new URL(value).protocol);
      } catch {
        return false;
      }
    }, "Use an http or https link."),
  linkTitle: z.string().trim().max(200)
});
export type PostInput = z.infer<typeof PostInput>;
export type PostPhoto = { file: File; alt: string };
