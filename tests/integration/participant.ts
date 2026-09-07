import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { createJoltClient, operations } from "jolt-sdk";
import { HttpTransport } from "jolt-sdk/transport-http";
import { createMessagesApplication } from "../../src/message/application";
import { createMessageMedia } from "../../src/message/media-repository";
import { SPOKE_CAPABILITIES } from "../../src/session";

export async function participant(port: number) {
  const url = `http://127.0.0.1:${port}`;
  const transport = new HttpTransport({ daemonUrl: url });
  const anonymous = createJoltClient({ transport, getSessionToken: () => "" });
  const { identity_address: identity } = await anonymous.getStatus();
  const request = await anonymous.requestSession({
    appId: "spoke.local",
    appName: "Spoke integration test",
    appOrigin: "http://127.0.0.1:5180",
    identity,
    capabilities: SPOKE_CAPABILITIES
  });
  const approval = await fetch(`${url}/admin/v1/app-requests/${request.request_id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity, capabilities: SPOKE_CAPABILITIES, expires_at: null })
  });
  expect(approval.ok).toBe(true);
  const { session_token: token } = await approval.json();
  const sdk = createJoltClient({ transport, getSessionToken: () => token });
  const media = createMessageMedia(identity, token, {
    publish: async (session, path, file, options) =>
      operations.publishEncryptedBytes(
        transport,
        session,
        path,
        new Uint8Array(await file.arrayBuffer()),
        options
      ),
    decrypt: (session, target) => operations.decryptEncryptedTarget(transport, session, target)
  });
  if (process.env.SPOKE_INTEGRATION_DIR)
    await writeFile(
      join(process.env.SPOKE_INTEGRATION_DIR, `${port}-access.json`),
      JSON.stringify({ identity, token, requestId: request.request_id, status: "active" }),
      { mode: 0o600 }
    );
  return {
    identity,
    sdk,
    token,
    requestId: request.request_id,
    app: createMessagesApplication(identity, sdk, media),
    reopen: () => createMessagesApplication(identity, sdk, media)
  };
}
