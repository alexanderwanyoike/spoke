import { apiErrorMessage } from "../jolt";
import type { MessagesData } from "./view-model";

type Snapshot = {
  status: "loading" | "ready" | "stale" | "unavailable";
  data: MessagesData;
  error: string;
  updatedAt: number | null;
  refreshing: boolean;
};

export function createMessagesResource(load: (signal: AbortSignal) => Promise<MessagesData>) {
  let snapshot: Snapshot = {
    status: "loading",
    data: { conversations: [], pendingCount: 0 },
    error: "",
    updatedAt: null,
    refreshing: false
  };
  const listeners = new Set<() => void>();
  let pending: Promise<void> | null = null;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let polling = false;
  let request = new AbortController();
  function publish(next: Snapshot) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }
  function refresh(): Promise<void> {
    if (pending) return pending;
    const current = generation;
    publish({ ...snapshot, refreshing: true });
    request = new AbortController();
    pending = load(request.signal)
      .then((data) => {
        if (generation !== current) return;
        publish({ status: "ready", data, error: "", updatedAt: Date.now(), refreshing: false });
      })
      .catch((cause) => {
        if (generation !== current) return;
        const status = snapshot.updatedAt === null ? "unavailable" : "stale";
        publish({ ...snapshot, status, error: apiErrorMessage(cause), refreshing: false });
      })
      .finally(() => {
        if (generation !== current) return;
        pending = null;
        if (polling) {
          clearTimeout(timer);
          timer = setTimeout(refresh, 5_000);
        }
      });
    return pending;
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh,
    start() {
      polling = true;
      void refresh();
    },
    stop() {
      request.abort();
      polling = false;
      generation++;
      pending = null;
      clearTimeout(timer);
    }
  };
}
export type MessagesResource = ReturnType<typeof createMessagesResource>;
