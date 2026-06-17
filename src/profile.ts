import type { SpokeProfile } from "./api";
import type { Contact } from "./feed";
import { normalizeIdentity, sameIdentity } from "./follow";

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
  if (contact?.displayName.trim()) {
    return contact.displayName.trim();
  }

  const profile = Object.entries(profiles).find(([profileIdentity]) =>
    sameIdentity(profileIdentity, identity)
  )?.[1];
  return profile?.displayName || identity;
}

export function profileCacheKey(identity: string) {
  return normalizeIdentity(identity);
}

export function isSpokeProfile(value: unknown): value is SpokeProfile {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const schema = (value as { schema?: unknown }).schema;
  return schema === "spoke.profile.v1" || schema === "spoke.profile.v2";
}

// Tolerant reader: decode bytes fetched from Jolt into a canonical profile, or
// null if the object is unrecoverable. One malformed object must never poison a
// Projection (see docs/CONTEXT.md "Tolerant readers, strict writers").
export function decodeProfile(bytes: number[]): SpokeProfile | null {
  try {
    const value = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))) as unknown;
    return isSpokeProfile(value) ? value : null;
  } catch {
    return null;
  }
}

export function profileLinksFromDraft(links: ProfileDraftLink[]) {
  return links
    .map((link) => ({
      label: link.label.trim(),
      url: link.url.trim()
    }))
    .filter((link) => link.label && link.url);
}
