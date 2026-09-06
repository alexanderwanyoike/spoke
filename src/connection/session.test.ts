import { expect, it, vi } from "vitest";
import { createSessionConnection } from "./session";
import { SPOKE_CAPABILITIES } from "../session";
function fixture() {
  const saved = {
    requestId: "existing",
    status: "active" as const,
    token: "token",
    identity: "alice"
  };
  const persistence = { read: vi.fn(() => saved), write: vi.fn(), clear: vi.fn() };
  const api = {
    check: vi.fn().mockResolvedValue(undefined),
    identity: vi.fn().mockResolvedValue("alice"),
    request: vi.fn(),
    poll: vi.fn(),
    current: vi.fn().mockResolvedValue({
      status: "active",
      identity: "alice",
      granted_capabilities: [...SPOKE_CAPABILITIES],
      app_id: "spoke.local"
    })
  };
  return { persistence, api };
}
it("reuses approved access without creating another app session", async () => {
  const { persistence, api } = fixture();
  const connection = createSessionConnection(api, persistence);
  await connection.refresh();
  expect(connection.getSnapshot()).toMatchObject({
    kind: "ready",
    identity: "alice",
    token: "token"
  });
  expect(api.request).not.toHaveBeenCalled();
});
it("keeps access during a network failure but removes it when revoked", async () => {
  const { persistence, api } = fixture();
  const connection = createSessionConnection(api, persistence);
  await connection.refresh();
  api.current.mockRejectedValueOnce(new Error("Offline"));
  await connection.refresh();
  expect(connection.getSnapshot()).toMatchObject({ kind: "ready", error: "Offline" });
  expect(persistence.clear).not.toHaveBeenCalled();
  api.current.mockResolvedValueOnce({ status: "revoked" });
  await connection.refresh();
  expect(connection.getSnapshot().kind).toBe("access");
  expect(persistence.clear).toHaveBeenCalled();
});
it("resumes an existing pending request", async () => {
  const { persistence, api } = fixture();
  persistence.read.mockReturnValueOnce({
    requestId: "pending",
    status: "pending",
    identity: "alice"
  } as never);
  api.poll.mockResolvedValueOnce({ request_id: "pending", status: "pending" });
  const connection = createSessionConnection(api, persistence);
  await connection.refresh();
  expect(connection.getSnapshot().kind).toBe("pending");
  expect(api.request).not.toHaveBeenCalled();
});

it("rediscovers the local identity after forgetting access", async () => {
  const { persistence, api } = fixture();
  const connection = createSessionConnection(api, persistence);
  await connection.refresh();
  persistence.read.mockReturnValue(null as never);
  api.identity.mockResolvedValue("current-local-identity");
  connection.disconnect();
  await vi.waitFor(() =>
    expect(connection.getSnapshot()).toMatchObject({
      kind: "access",
      identity: "current-local-identity"
    })
  );
  expect(api.request).not.toHaveBeenCalled();
});
