import type { SessionApi } from "./api";
import type { SessionPersistence } from "./persistence";
import { SpokeAccess } from "./access";
import { ConnectionMonitor } from "./monitor";

export function createSessionConnection(api: SessionApi, persistence: SessionPersistence) {
  return new ConnectionMonitor(new SpokeAccess(api, persistence));
}
