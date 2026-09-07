import { normalizeIdentity, sameIdentity } from "../follow";
import type { ProfileReader } from "./loaders";
import { PROFILE_PATH } from "./commands";
import { decodeProfile } from "./model";

const REFRESH_INTERVAL_MS = 60_000;

/** Session-scoped profile labels. Failed refreshes retain the last verified name. */
export function createProfileNames(reader: ProfileReader) {
  const names = new Map<string, string>();
  const refreshAfter = new Map<string, number>();
  const pending = new Map<string, Promise<void>>();

  async function refresh(identity: string) {
    try {
      const hit = await reader.read(
        { identity: `${identity}.jolt`, path: PROFILE_PATH },
        decodeProfile,
        {
          timeoutMs: 2_500
        }
      );
      if (!hit || !sameIdentity(hit.value.identity, identity)) return;
      const name = hit.value.displayName.trim();
      if (name) names.set(identity, name);
    } catch {
      // Profile availability must not change whether a contact can exchange messages.
    } finally {
      refreshAfter.set(identity, Date.now() + REFRESH_INTERVAL_MS);
      pending.delete(identity);
    }
  }

  return {
    async load(identities: string[]) {
      await Promise.all(
        [...new Set(identities.map(normalizeIdentity))].map((identity) => {
          const inFlight = pending.get(identity);
          if (inFlight) return inFlight;
          if (Date.now() < (refreshAfter.get(identity) ?? 0)) return;
          const operation = refresh(identity);
          pending.set(identity, operation);
          return operation;
        })
      );
      return new Map(names);
    }
  };
}
