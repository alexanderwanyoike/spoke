import { apiErrorMessage } from "../jolt";
import { SPOKE_CAPABILITIES } from "../session";
import type { SessionApi } from "./api";
import type { SavedSession, SessionPersistence } from "./persistence";

type ConnectionState =
  | { kind: "checking"; error: string }
  | { kind: "access"; identity: string; error: string }
  | { kind: "pending"; identity: string; error: string }
  | { kind: "error"; error: string }
  | { kind: "ready"; identity: string; token: string; error: string };

export function createSessionConnection(api: SessionApi, persistence: SessionPersistence) {
  let state: ConnectionState = { kind: "checking", error: "" };
  let saved: SavedSession | null = persistence.read();
  let operation: Promise<void> | null = null;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  const listeners = new Set<() => void>();
  function publish(next: ConnectionState) {
    state = next;
    listeners.forEach((listener) => listener());
  }
  function save(value: SavedSession) {
    persistence.write(value);
    saved = value;
  }
  async function inspect(current: number) {
    await api.check();
    if (current !== generation) return;
    if (saved?.token) {
      const token = saved.token;
      const session = await api.current(token);
      if (current !== generation) return;
      const allowed =
        session.status === "active" &&
        session.app_id === "spoke.local" &&
        session.identity &&
        SPOKE_CAPABILITIES.every((capability) => session.granted_capabilities.includes(capability));
      if (allowed && session.identity) {
        publish({ kind: "ready", identity: session.identity, token, error: "" });
        return;
      }
      persistence.clear();
      saved = null;
      publish({
        kind: "access",
        identity: session.identity || "",
        error: "Jolt access has ended. Connect again when you are ready."
      });
      return;
    }
    if (saved?.status === "pending" && saved.requestId) {
      const response = await api.poll(saved.requestId);
      if (current !== generation) return;
      save({
        requestId: response.request_id,
        status: response.status,
        token: response.session_token,
        identity: response.identity || saved.identity
      });
      if (response.status === "active" && response.session_token) {
        await inspect(current);
        return;
      }
      if (response.status === "pending") {
        publish({ kind: "pending", identity: saved?.identity || "", error: "" });
        return;
      }
      persistence.clear();
      saved = null;
    }
    const identity = await api.identity();
    if (current === generation) publish({ kind: "access", identity, error: "" });
  }
  function perform(action: (current: number) => Promise<void>): Promise<void> {
    if (operation) return operation;
    const current = generation;
    operation = action(current)
      .catch((cause) => {
        if (current !== generation) return;
        const error = apiErrorMessage(cause);
        if (state.kind === "ready" || state.kind === "pending" || state.kind === "access")
          publish({ ...state, error });
        else publish({ kind: "error", error });
      })
      .finally(() => {
        if (current !== generation) return;
        operation = null;
        if (running) {
          clearTimeout(timer);
          timer = setTimeout(refresh, state.kind === "pending" ? 1500 : 15_000);
        }
      });
    return operation;
  }
  function refresh() {
    return perform(inspect);
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh,
    request(identity: string) {
      return perform(async (current) => {
        saved = persistence.read();
        if (saved?.token || saved?.status === "pending") {
          await inspect(current);
          return;
        }
        const response = await api.request(identity);
        if (current !== generation) return;
        save({ requestId: response.request_id, status: response.status, identity });
        publish({ kind: "pending", identity, error: "" });
      });
    },
    disconnect() {
      generation++;
      operation = null;
      clearTimeout(timer);
      persistence.clear();
      saved = null;
      publish({ kind: "access", identity: "", error: "" });
    },
    start() {
      running = true;
      void refresh();
    },
    stop() {
      running = false;
      generation++;
      operation = null;
      clearTimeout(timer);
    }
  };
}
