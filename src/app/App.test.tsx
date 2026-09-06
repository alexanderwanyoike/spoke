// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import App from "./App";
import { sessionApi } from "../connection/api";
import { createMessagesGateway } from "../message/gateway";
import { SPOKE_CAPABILITIES } from "../session";
import { conversation, gatewayFixture } from "../test/messages";

vi.mock("../connection/api", () => ({
  sessionApi: {
    check: vi.fn(),
    current: vi.fn(),
    identity: vi.fn(),
    poll: vi.fn(),
    request: vi.fn()
  }
}));
vi.mock("../message/gateway", () => ({ createMessagesGateway: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("spoke.appearance", "light");
  localStorage.setItem(
    "spoke.session",
    JSON.stringify({ requestId: "saved", token: "token", identity: "alice", status: "active" })
  );
  window.location.hash = "#/messages";
  vi.mocked(sessionApi.check).mockResolvedValue(undefined);
  vi.mocked(sessionApi.current).mockResolvedValue({
    request_id: "saved",
    app_id: "spoke.local",
    app_name: "Spoke",
    identity: "alice",
    status: "active",
    granted_capabilities: [...SPOKE_CAPABILITIES]
  });
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

it("routes conversations, preserves drafts through navigation and filters by identity", async () => {
  const { gateway } = gatewayFixture();
  vi.mocked(createMessagesGateway).mockReturnValue(gateway);
  const user = userEvent.setup();
  render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  await user.click(await screen.findByRole("link", { name: /Bob/ }));
  expect(window.location.hash).toBe("#/messages/conv_alice_bob");
  await user.type(screen.getByRole("textbox", { name: "Message Bob" }), "A draft for Bob");
  await user.click(screen.getByRole("link", { name: /Carol/ }));
  expect(screen.getByRole("textbox", { name: "Message Carol" })).toHaveValue("");
  await user.click(screen.getByRole("link", { name: /Bob/ }));
  expect(screen.getByRole("textbox", { name: "Message Bob" })).toHaveValue("A draft for Bob");
  await user.click(screen.getByRole("link", { name: "Back to conversations" }));
  expect(screen.queryByRole("textbox", { name: "Message Bob" })).not.toBeInTheDocument();
  await user.type(screen.getByRole("textbox", { name: "Find a conversation" }), "CAROL");
  expect(screen.getByRole("link", { name: /Carol/ })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Bob/ })).not.toBeInTheDocument();
  expect(sessionApi.request).not.toHaveBeenCalled();
  expect(gateway.send).not.toHaveBeenCalled();
});

it("keeps the conversation and draft visible during refresh failure and recovers on retry", async () => {
  const { gateway } = gatewayFixture();
  vi.mocked(createMessagesGateway).mockReturnValue(gateway);
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole("link", { name: /Bob/ }));
  await user.type(screen.getByRole("textbox", { name: "Message Bob" }), "Keep this");
  gateway.load.mockRejectedValueOnce(new Error("Offline"));
  await user.click(screen.getByRole("button", { name: "Refresh conversations" }));
  expect(await screen.findByText(/Offline.*Your drafts/)).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Message Bob" })).toHaveValue("Keep this");
  await user.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.queryByText(/Offline.*Your drafts/)).not.toBeInTheDocument());
  expect(screen.getByRole("textbox", { name: "Message Bob" })).toHaveValue("Keep this");
});

it("renders deep-linked history as read-only when contact access has ended", async () => {
  const bob = conversation();
  bob.canSend = false;
  bob.messages = ["received", "sent", "sent"].map((direction, index) => ({
    direction: direction as "sent" | "received",
    message: {
      schema: "spoke.message.v2",
      id: `m${index}`,
      conversationId: bob.id,
      sender: "alice",
      recipients: ["bob"],
      body: `Message ${index}`,
      createdAt: "2026-09-06T12:00:00Z"
    }
  }));
  const { gateway } = gatewayFixture([bob]);
  gateway.confirmed.add("m2");
  vi.mocked(createMessagesGateway).mockReturnValue(gateway);
  window.location.hash = `#/messages/${bob.id}`;
  render(<App />);
  expect(await screen.findByText(/no longer an accepted contact/)).toBeVisible();
  expect(screen.getByRole("article", { name: "Received message" })).toHaveTextContent("Message 0");
  expect(screen.getByRole("article", { name: "Outgoing copy message" })).toHaveTextContent(
    "Message 1"
  );
  expect(screen.getByRole("article", { name: "Sent message" })).toHaveTextContent("Message 2");
  expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
});

it("persists appearance and aborts the Messages load when access is forgotten", async () => {
  const { gateway } = gatewayFixture();
  vi.mocked(createMessagesGateway).mockReturnValue(gateway);
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("link", { name: /Bob/ });
  await user.click(screen.getByRole("button", { name: "Use dark appearance" }));
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.getItem("spoke.appearance")).toBe("dark");
  let complete!: (value: Awaited<ReturnType<typeof gateway.load>>) => void;
  gateway.load.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      })
  );
  await user.click(screen.getByRole("button", { name: "Refresh conversations" }));
  const signal = gateway.load.mock.calls[gateway.load.mock.calls.length - 1][0];
  await user.click(screen.getByRole("button", { name: "Forget access" }));
  expect(signal?.aborted).toBe(true);
  expect(localStorage.getItem("spoke.session")).toBeNull();
  await act(async () =>
    complete({
      conversations: [conversation()],
      pendingCount: 0,
      contactRequests: [],
      requestedContacts: []
    })
  );
  expect(screen.queryByRole("heading", { name: "Messages" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Connect to Jolt" })).toBeVisible();
});
