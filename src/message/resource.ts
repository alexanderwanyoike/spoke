import { apiErrorMessage } from "../jolt";
import type { MessagesData } from "./view-model";

type Snapshot = {
  status: "loading" | "ready" | "stale" | "unavailable";
  data: MessagesData;
  error: string;
  updatedAt: number | null;
  refreshing: boolean;
};

export class MessagesResource {
  private snapshot: Snapshot = {
    status: "loading",
    data: { conversations: [], pendingCount: 0, contactRequests: [], requestedContacts: [] },
    error: "",
    updatedAt: null,
    refreshing: false
  };
  private listeners = new Set<() => void>();
  private pending: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private polling = false;
  private request = new AbortController();

  constructor(private load: (signal: AbortSignal) => Promise<MessagesData>) {}

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  start = () => {
    this.polling = true;
    void this.refresh();
  };
  stop = () => {
    this.request.abort();
    this.polling = false;
    this.pending = null;
    clearTimeout(this.timer);
  };

  refresh = (): Promise<void> => {
    if (this.pending) return this.pending;
    this.publish({ ...this.snapshot, refreshing: true });
    this.request = new AbortController();
    const { signal } = this.request;
    this.pending = this.load(signal)
      .then((data) => {
        if (!signal.aborted) this.loaded(data);
      })
      .catch((cause) => {
        if (!signal.aborted) this.failed(cause);
      })
      .finally(() => {
        if (!signal.aborted) this.schedule();
      });
    return this.pending;
  };

  private loaded(data: MessagesData) {
    this.publish({ status: "ready", data, error: "", updatedAt: Date.now(), refreshing: false });
  }

  private failed(cause: unknown) {
    const status = this.snapshot.updatedAt === null ? "unavailable" : "stale";
    this.publish({ ...this.snapshot, status, error: apiErrorMessage(cause), refreshing: false });
  }

  private publish(snapshot: Snapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }

  private schedule() {
    this.pending = null;
    if (!this.polling) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(this.refresh, 5_000);
  }
}

export function createMessagesResource(load: (signal: AbortSignal) => Promise<MessagesData>) {
  return new MessagesResource(load);
}
