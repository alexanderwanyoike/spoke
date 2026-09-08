import { normalizeIdentity } from "../follow";
import type { ProfileRepository } from "./editor";

export const AVATAR_REFRESH_MS = 60_000;
export interface ProfileAvatars {
  load(identity: string): Promise<Blob | null>;
  invalidate(identity: string): void;
}

type CachedAvatar = {
  photo?: { contentId: string; blob: Blob };
  refreshAfter: number;
  pending?: Promise<Blob | null>;
};

/** Public pictures are optional presentation data, scoped to the signed-in session. */
export function createProfileAvatars(profiles: ProfileRepository): ProfileAvatars {
  const cache = new Map<string, CachedAvatar>();

  async function refresh(identity: string, entry: CachedAvatar) {
    try {
      const { profile } = await profiles.load(`${identity}.jolt`);
      // An unavailable profile is not evidence that its owner removed their picture.
      if (!profile) return entry.photo?.blob ?? null;
      const attachment = profile.avatar;
      if (!attachment) {
        entry.photo = undefined;
        return null;
      }
      if (entry.photo?.contentId === attachment.contentId) return entry.photo.blob;
      if (!profiles.images) return null;
      const blob = await profiles.images.load(attachment);
      entry.photo = { contentId: attachment.contentId, blob };
      return blob;
    } catch {
      // A temporarily offline author must not break conversations or erase a known picture.
      return entry.photo?.blob ?? null;
    } finally {
      entry.refreshAfter = Date.now() + AVATAR_REFRESH_MS;
      entry.pending = undefined;
    }
  }

  return {
    load(owner) {
      const identity = normalizeIdentity(owner);
      let entry = cache.get(identity);
      if (!entry) {
        entry = { refreshAfter: 0 };
        cache.set(identity, entry);
      }
      if (entry.pending) return entry.pending;
      if (Date.now() < entry.refreshAfter) return Promise.resolve(entry.photo?.blob ?? null);
      entry.pending = refresh(identity, entry);
      return entry.pending;
    },
    invalidate(owner) {
      cache.delete(normalizeIdentity(owner));
    }
  };
}
