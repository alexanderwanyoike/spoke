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
  type ProfilesByIdentity
} from "./model";
export { loadProfile, publishProfile, PROFILE_PATH } from "./commands";
export { selectProfile, selectProfiles, useProfile, useProfiles } from "./queries";
