import type { PublicImages } from "../media/public";
import { validateImageAttachment } from "../media";
import { z } from "zod";
import type { SpokeProfile } from "./model";

const Website = z
  .string()
  .trim()
  .refine((value) => {
    if (!value) return true;
    try {
      return ["https:", "http:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, "Use a complete http or https address.");

export const ProfileInput = z.object({
  displayName: z.string().trim().min(1, "Enter a display name.").max(100),
  bio: z.string().trim().max(1000),
  location: z.string().trim().max(100),
  pronouns: z.string().trim().max(50),
  website: Website
});
export type ProfileInput = z.infer<typeof ProfileInput>;
export type ProfileSnapshot = { profile: SpokeProfile | null; contentId: string | null };
export interface ProfileRepository {
  images?: PublicImages;
  load(identity: string): Promise<ProfileSnapshot>;
  save(
    input: ProfileInput,
    expectedContentId: string | null,
    photo?: File | null
  ): Promise<ProfileSnapshot>;
}

export function createProfileEditor(repository: ProfileRepository) {
  return {
    save: async (input: ProfileInput, expectedContentId: string | null, photo?: File | null) => {
      const draft = ProfileInput.parse(input);
      if (photo) validateImageAttachment(photo);
      return repository.save(draft, expectedContentId, photo);
    }
  };
}

export function profileDraft(profile: SpokeProfile | null): ProfileInput {
  return {
    displayName: profile?.displayName || "",
    bio: profile?.bio || "",
    location: profile?.location || "",
    pronouns: profile?.pronouns || "",
    website: profile?.links?.[0]?.url || ""
  };
}
