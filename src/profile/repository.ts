import { createPublicImages, type PublicImages } from "../media/public";
import { validateImageAttachment } from "../media";
import { createJoltSdk, makeId, type JoltSdk } from "../jolt";
import { sameIdentity } from "../follow";
import { PROFILE_PATH } from "./commands";
import { decodeProfile, type SpokeProfile } from "./model";
import { ProfileInput, type ProfileRepository } from "./editor";

export function createProfileRepository(
  identity: string,
  sdk: JoltSdk,
  images?: PublicImages
): ProfileRepository {
  async function load(owner: string) {
    const hit = await sdk.read({ identity: owner, path: PROFILE_PATH }, decodeProfile);
    if (!hit) return { profile: null, contentId: null };
    if (!sameIdentity(hit.value.identity, owner))
      throw new Error("The profile does not belong to this identity.");
    return { profile: hit.value, contentId: hit.contentId };
  }

  return {
    load,
    images,
    async save(input, expectedContentId, photo) {
      const draft = ProfileInput.parse(input);
      if (photo) validateImageAttachment(photo);
      const current = await load(identity);
      if (current.contentId !== expectedContentId)
        throw new Error(
          "Your profile changed while you were editing. Keep your draft and reload the profile before saving again."
        );
      let avatar = current.profile?.avatar;
      if (photo === null) avatar = undefined;
      if (photo) {
        if (!images) throw new Error("Profile picture upload is unavailable.");
        avatar = await images.upload(photo, `${draft.displayName} profile picture`);
      }
      const profile: SpokeProfile = {
        ...current.profile,
        avatar,
        schema: "spoke.profile.v2",
        identity,
        displayName: draft.displayName,
        bio: draft.bio,
        location: draft.location,
        pronouns: draft.pronouns,
        links: draft.website ? [{ label: "Website", url: draft.website }] : [],
        updatedAt: new Date().toISOString()
      };
      const ref = { identity, path: PROFILE_PATH };
      const record = await sdk.readRecord(ref);
      if (record.state === "present") {
        if (record.contentId !== expectedContentId)
          throw new Error("Your profile changed. Reload it before saving again.");
        const saved = await sdk.updateRecord(ref, profile, {
          revision: record.revision,
          mutationId: makeId("profile")
        });
        return { profile, contentId: saved.contentId };
      }
      if (record.state !== "missing")
        throw new Error(
          "Your profile has changed or has a conflict. Reload it before saving again."
        );
      const saved = await sdk.publishJson(PROFILE_PATH, profile);
      return { profile, contentId: saved.contentId };
    }
  };
}

export function createProfilesGateway(identity: string, token: string) {
  return createProfileRepository(
    identity,
    createJoltSdk(() => token),
    createPublicImages(token)
  );
}
