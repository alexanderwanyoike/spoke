// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { MessageSession } from "../MessageSession";
import { MessageList } from "./MessageList";
import { gatewayFixture } from "../../test/messages";
import type { ConversationMessage } from "../model";
afterEach(cleanup);

it("opens the recent history first and lets the reader reveal earlier messages", async () => {
  const { gateway } = gatewayFixture();
  const messages: ConversationMessage[] = Array.from({ length: 101 }, (_, index) => ({
    direction: "received",
    message: {
      schema: "spoke.message.v2",
      id: `message-${index}`,
      conversationId: "conv_alice_bob",
      sender: "bob",
      recipients: ["alice"],
      body: `History item ${index}`,
      createdAt: "2026-09-06T12:00:00Z"
    }
  }));
  const user = userEvent.setup();
  render(
    <MessageSession gateway={gateway}>
      <MessageList messages={messages} />
    </MessageSession>
  );
  expect(screen.queryByText("History item 0", { exact: true })).not.toBeInTheDocument();
  expect(screen.getByText("History item 100", { exact: true })).toBeVisible();
  expect(screen.getAllByRole("article")).toHaveLength(100);
  await user.click(screen.getByRole("button", { name: "Show earlier messages" }));
  expect(screen.getByText("History item 0", { exact: true })).toBeVisible();
  expect(screen.getAllByRole("article")).toHaveLength(101);
  expect(screen.queryByRole("button", { name: "Show earlier messages" })).not.toBeInTheDocument();
});
