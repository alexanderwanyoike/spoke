import { normalizeIdentity } from "../follow";
import { createJoltSdk } from "../jolt";
import { PROFILE_PATH } from "./commands";
import type { ProfileReader } from "./loaders";
import { decodeProfile } from "./model";

export interface AccountProfile {
  load(): Promise<string | null>;
}

export async function loadAccountName(reader: ProfileReader, identity: string) {
  const profile = await reader.read({ identity, path: PROFILE_PATH }, decodeProfile);
  if (!profile) return null;
  if (normalizeIdentity(profile.value.identity) !== normalizeIdentity(identity)) return null;
  return profile.value.displayName.trim() || null;
}

export function createAccountProfile(identity: string, token: string): AccountProfile {
  const reader = createJoltSdk(() => token);
  return {
    load: () => loadAccountName(reader, identity)
  };
}
