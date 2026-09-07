import { SPOKE_CAPABILITIES } from "../session";
import type { CurrentAppSession } from "../jolt";
import type { SessionApi } from "./api";
import type { SessionPersistence } from "./persistence";

export type AccessState =
  | { kind: "access"; identity: string }
  | { kind: "pending"; identity: string }
  | { kind: "ready"; identity: string; token: string };

function grantsSpokeAccess(session: CurrentAppSession): boolean {
  return (
    session.status === "active" &&
    session.app_id === "spoke.local" &&
    Boolean(session.identity) &&
    SPOKE_CAPABILITIES.every((capability) => session.granted_capabilities.includes(capability))
  );
}

/** Session approval and restoration, independent of React and polling. */
export class SpokeAccess {
  constructor(
    private api: SessionApi,
    private persistence: SessionPersistence
  ) {}

  async inspect(signal: AbortSignal): Promise<AccessState> {
    await this.api.check();
    signal.throwIfAborted();
    const saved = this.persistence.read();
    if (saved?.token) return this.restore(saved.token, signal);
    if (saved?.status === "pending")
      return this.resume(saved.requestId, saved.identity || "", signal);
    const identity = await this.api.identity();
    signal.throwIfAborted();
    return { kind: "access", identity };
  }

  async request(identity: string, signal: AbortSignal): Promise<AccessState> {
    const saved = this.persistence.read();
    if (saved?.token || saved?.status === "pending") return this.inspect(signal);
    const response = await this.api.request(identity);
    signal.throwIfAborted();
    this.persistence.write({ requestId: response.request_id, status: response.status, identity });
    return { kind: "pending", identity };
  }

  forget() {
    this.persistence.clear();
  }

  private async restore(token: string, signal: AbortSignal): Promise<AccessState> {
    const session = await this.api.current(token);
    signal.throwIfAborted();
    if (grantsSpokeAccess(session)) return { kind: "ready", identity: session.identity!, token };
    this.forget();
    return { kind: "access", identity: session.identity || "" };
  }

  private async resume(
    requestId: string,
    identity: string,
    signal: AbortSignal
  ): Promise<AccessState> {
    const response = await this.api.poll(requestId);
    signal.throwIfAborted();
    this.persistence.write({
      requestId,
      status: response.status,
      token: response.session_token,
      identity
    });
    if (response.status === "active" && response.session_token)
      return this.restore(response.session_token, signal);
    if (response.status === "pending") return { kind: "pending", identity };
    this.forget();
    return { kind: "access", identity };
  }
}
