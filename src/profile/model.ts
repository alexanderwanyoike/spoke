import { z } from "zod";
import { IMAGE_ATTACHMENT_MIME_TYPES } from "../media";
import type { Decoder } from "../jolt";
import type { SpokeAttachment } from "../media";
import type { Contact } from "../feed";
import { normalizeIdentity, sameIdentity } from "../follow";

export type SpokeProfileLink = {
  label: string;
  url: string;
};

export type SpokeProfile = {
  schema: "spoke.profile.v1" | "spoke.profile.v2";
  identity: string;
  displayName: string;
  bio: string;
  avatar?: SpokeAttachment;
  links?: SpokeProfileLink[];
  location?: string;
  pronouns?: string;
  updatedAt: string;
};

export type ProfilesByIdentity = Record<string, SpokeProfile>;

export type ProfileDraftLink = {
  label: string;
  url: string;
};

export type ProfileDraft = {
  displayName: string;
  bio: string;
  location: string;
  pronouns: string;
  links: ProfileDraftLink[];
  avatar?: SpokeProfile["avatar"];
};

export function normalizeProfileDraft(value: Partial<ProfileDraft>): ProfileDraft {
  return {
    displayName: value.displayName || "",
    bio: value.bio || "",
    location: value.location || "",
    pronouns: value.pronouns || "",
    links: (value.links || []).filter((link) => link.label || link.url),
    avatar: value.avatar
  };
}

export function displayNameForProfileIdentity(input: {
  identity: string;
  localIdentity?: string;
  localDisplayName?: string;
  contacts: Contact[];
  profiles: ProfilesByIdentity;
}) {
  const { identity, localIdentity, localDisplayName, contacts, profiles } = input;
  if (localIdentity && sameIdentity(identity, localIdentity)) {
    return localDisplayName?.trim() || profiles[identity]?.displayName || identity;
  }

  const contact = contacts.find((item) => sameIdentity(item.identity, identity));
  const localNickname = contact?.displayName.trim();
  if (contact && localNickname && localNickname !== contact.identity.trim()) {
    return localNickname;
  }

  const profile = Object.entries(profiles).find(([profileIdentity]) =>
    sameIdentity(profileIdentity, identity)
  )?.[1];
  return profile?.displayName || identity;
}

export function profileCacheKey(identity: string) {
  return normalizeIdentity(identity);
}

const ProfileRecord = z.object({
  schema: z.enum(["spoke.profile.v1", "spoke.profile.v2"]),
  identity: z.string().min(1),
  displayName: z.string(),
  bio: z.string(),
  updatedAt: z.string(),
  location: z.string().optional(),
  pronouns: z.string().optional(),
  links: z.array(z.object({ label: z.string(), url: z.string() })).optional(),
  avatar: z
    .object({
      id: z.string(),
      kind: z.literal("image"),
      contentId: z.string().min(1),
      address: z.string().nullable().optional(),
      mimeType: z.enum(IMAGE_ATTACHMENT_MIME_TYPES),
      size: z.number().nonnegative(),
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
      alt: z.string().optional()
    })
    .optional()
});

export function isSpokeProfile(value: unknown): value is SpokeProfile {
  return ProfileRecord.safeParse(value).success;
}

export const decodeProfile: Decoder<SpokeProfile> = (value) => {
  const parsed = ProfileRecord.safeParse(value);
  return parsed.success ? parsed.data : null;
};

export function profileLinksFromDraft(links: ProfileDraftLink[]) {
  return links
    .map((link) => ({
      label: link.label.trim(),
      url: link.url.trim()
    }))
    .filter((link) => link.label && link.url);
}
