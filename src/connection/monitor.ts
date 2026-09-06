import { apiErrorMessage } from "../jolt";
import { SpokeAccess, type AccessState } from "./access";

type ConnectionState = (AccessState | { kind: "checking" } | { kind: "error" }) & { error: string };
type AccessOperation = (signal: AbortSignal) => Promise<AccessState>;

/** Owns one polling lifetime; cancelled work can never restore forgotten access. */
export class ConnectionMonitor {
  private state: ConnectionState = { kind: "checking", error: "" };
  private listeners = new Set<() => void>();
  private pending: Promise<void> | null = null;
  private requestController = new AbortController();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;

  constructor(private access: SpokeAccess) {}

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  refresh = () => this.perform((signal) => this.access.inspect(signal));
  request = (identity: string) => this.perform((signal) => this.access.request(identity, signal));

  start = () => {
    this.running = true;
    void this.refresh();
  };
  stop = () => {
    this.running = false;
    this.cancel();
  };
  disconnect = () => {
    this.cancel();
    this.access.forget();
    this.publish({ kind: "checking", error: "" });
    void this.refresh();
  };

  private cancel() {
    this.requestController.abort();
    this.pending = null;
    clearTimeout(this.timer);
  }

  private publish(state: ConnectionState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }

  private failed(cause: unknown) {
    const error = apiErrorMessage(cause);
    if (this.state.kind === "checking" || this.state.kind === "error") {
      this.publish({ kind: "error", error });
      return;
    }
    this.publish({ ...this.state, error });
  }

  private schedule() {
    if (!this.running) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(this.refresh, this.state.kind === "pending" ? 1500 : 15_000);
  }

  private perform(operation: AccessOperation): Promise<void> {
    if (this.pending) return this.pending;
    this.requestController = new AbortController();
    const { signal } = this.requestController;
    this.pending = operation(signal)
      .then((state) => {
        if (signal.aborted) return;
        const ended = this.state.kind === "ready" && state.kind === "access";
        this.publish({
          ...state,
          error: ended ? "Jolt access has ended. Connect again when you are ready." : ""
        });
      })
      .catch((cause) => {
        if (!signal.aborted) this.failed(cause);
      })
      .finally(() => {
        if (signal.aborted) return;
        this.pending = null;
        this.schedule();
      });
    return this.pending;
  }
}
