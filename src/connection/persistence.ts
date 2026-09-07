import { z } from "zod";
const SavedSession = z.object({
  requestId: z.string(),
  token: z.string().nullish(),
  identity: z.string().nullish(),
  status: z.enum(["pending", "active", "rejected", "revoked", "expired"])
});
export type SavedSession = z.infer<typeof SavedSession>;
export interface SessionPersistence {
  read(): SavedSession | null;
  write(value: SavedSession): void;
  clear(): void;
}

export function sessionPersistence(storage: Storage): SessionPersistence {
  return {
    read() {
      const raw = storage.getItem("spoke.session");
      if (!raw) return null;
      try {
        const result = SavedSession.safeParse(JSON.parse(raw));
        return result.success ? result.data : null;
      } catch {
        return null;
      }
    },
    write(value) {
      storage.setItem("spoke.session", JSON.stringify(value));
    },
    clear() {
      storage.removeItem("spoke.session");
    }
  };
}
