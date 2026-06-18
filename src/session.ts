// Spoke session bootstrap: the capabilities and app identity Spoke requests when
// opening a Jolt session. These are Spoke's concern, not the transport's - the
// Jolt SDK only knows how to make a generic session request.

import { requestSession } from "./jolt";

export const SPOKE_CAPABILITIES = [
  "resolve:public",
  "fetch:public",
  "publish:/spoke/*",
  "publish:encrypted:/spoke/*",
  "inventory:/spoke/*",
  "pin:own:/spoke/*",
  "encrypt:/spoke/*",
  "decrypt:/spoke/*",
  "ingress:send",
  "ingress:read",
  "ingress:decide"
] as const;

const SPOKE_APP_ID = "spoke.local";
const SPOKE_APP_NAME = "Spoke";
const SPOKE_APP_ORIGIN = "http://127.0.0.1:5178";

export function requestSpokeSession(identity: string) {
  const appOrigin = typeof window === "undefined" ? SPOKE_APP_ORIGIN : window.location.origin;
  return requestSession({
    appId: SPOKE_APP_ID,
    appName: SPOKE_APP_NAME,
    appOrigin,
    identity,
    capabilities: SPOKE_CAPABILITIES
  });
}
