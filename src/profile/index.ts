// Public surface of the profile feature. Consumers import everything
// profile-related from "./profile"; the internal split (model / commands /
// queries) and the store + Jolt SDK below it stay private to the feature.

export {
  decodeProfile,
  displayNameForProfileIdentity,
  isSpokeProfile,
  normalizeProfileDraft,
  profileCacheKey,
  profileLinksFromDraft,
  type ProfileDraft,
  type ProfileDraftLink,
  type ProfilesByIdentity,
  type SpokeProfile,
  type SpokeProfileLink
} from "./model";
export { publishProfile, PROFILE_PATH } from "./commands";
export { loadProfile } from "./loaders";
export { selectProfile, selectProfiles, useProfile, useProfiles } from "./queries";
export { AccountIdentity } from "./AccountIdentity";
export { createAccountProfile } from "./account";

export { createProfilesGateway } from "./repository";
export { ProfilePage } from "./ProfilePage";

export type { ProfileRepository } from "./editor";
