// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ConnectionBoundary } from "./ConnectionBoundary";
import { sessionApi } from "./api";
import { SPOKE_CAPABILITIES } from "../session";
vi.mock("./api", () => ({
  sessionApi: {
    check: vi.fn(),
    current: vi.fn(),
    identity: vi.fn(),
    poll: vi.fn(),
    request: vi.fn()
  }
}));
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(sessionApi.check).mockResolvedValue(undefined);
  vi.mocked(sessionApi.identity).mockResolvedValue("alice");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
});
async function mount() {
  await act(async () => {
    render(
      <React.StrictMode>
        <ConnectionBoundary>
          {(session) => (
            <div>
              <h2>Connected as {session.identity}</h2>
              <input aria-label="Private draft" />
            </div>
          )}
        </ConnectionBoundary>
      </React.StrictMode>
    );
  });
}
it("validates access input, requests once, and opens the connected subtree after approval", async () => {
  vi.mocked(sessionApi.request).mockResolvedValue({ request_id: "request", status: "pending" });
  vi.mocked(sessionApi.poll).mockResolvedValue({
    request_id: "request",
    status: "active",
    session_token: "token",
    identity: "alice",
    capabilities: [...SPOKE_CAPABILITIES]
  });
  vi.mocked(sessionApi.current).mockResolvedValue({
    request_id: "request",
    app_id: "spoke.local",
    app_name: "Spoke",
    status: "active",
    identity: "alice",
    granted_capabilities: [...SPOKE_CAPABILITIES]
  });
  await mount();
  fireEvent.change(screen.getByRole("textbox", { name: "Your Jolt identity" }), {
    target: { value: "" }
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Connect to Jolt" }));
  });
  expect(screen.getByRole("alert")).toHaveTextContent("Enter your Jolt identity.");
  expect(sessionApi.request).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("textbox", { name: "Your Jolt identity" }), {
    target: { value: " alice " }
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Connect to Jolt" }));
  });
  expect(screen.getByRole("heading", { name: "Approve Spoke in Jolt Console" })).toBeVisible();
  expect(sessionApi.request).toHaveBeenCalledExactlyOnceWith("alice");
  expect(screen.queryByRole("textbox", { name: "Private draft" })).not.toBeInTheDocument();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(screen.getByRole("heading", { name: "Connected as alice" })).toBeVisible();
});
it("retains mounted private state through a temporary failure and removes it on revocation", async () => {
  localStorage.setItem(
    "spoke.session",
    JSON.stringify({ requestId: "saved", token: "token", status: "active" })
  );
  const active = {
    request_id: "saved",
    app_id: "spoke.local",
    app_name: "Spoke",
    status: "active" as const,
    identity: "alice",
    granted_capabilities: [...SPOKE_CAPABILITIES]
  };
  vi.mocked(sessionApi.current).mockResolvedValue(active);
  await mount();
  fireEvent.change(screen.getByRole("textbox", { name: "Private draft" }), {
    target: { value: "Keep my state" }
  });
  vi.mocked(sessionApi.current).mockRejectedValueOnce(new Error("Offline"));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000);
  });
  expect(screen.getByRole("status")).toHaveTextContent("Connection needs attention: Offline");
  expect(screen.getByRole("textbox", { name: "Private draft" })).toHaveValue("Keep my state");
  vi.mocked(sessionApi.current).mockResolvedValueOnce({ ...active, status: "revoked" });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000);
  });
  expect(screen.queryByRole("textbox", { name: "Private draft" })).not.toBeInTheDocument();
  expect(screen.getByText(/Jolt access has ended/)).toBeVisible();
  expect(sessionApi.request).not.toHaveBeenCalled();
});
it("allows retry after startup failure without exposing connected children", async () => {
  vi.mocked(sessionApi.check).mockRejectedValueOnce(new Error("Update Jolt"));
  // A single mount keeps the first failed request authoritative in this scenario.
  await act(async () => {
    render(<ConnectionBoundary>{() => <h2>Private content</h2>}</ConnectionBoundary>);
  });
  expect(screen.getByRole("alert")).toHaveTextContent("Update Jolt");
  expect(screen.queryByText("Private content")).not.toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  });
  expect(screen.getByRole("textbox", { name: "Your Jolt identity" })).toHaveValue("alice");
});
