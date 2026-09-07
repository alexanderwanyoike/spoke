// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom/vitest";
import { ActivityPage } from "./ActivityPage";
afterEach(cleanup);
it("filters real events, links to their destination and preserves unread state when saving fails", async () => {
  const read = vi.fn().mockRejectedValueOnce(new Error("Offline"));
  const items = [
    {
      id: "r",
      kind: "reply" as const,
      name: "Bob",
      description: "replied to your post",
      preview: "Hello",
      createdAt: "2026-09-07T00:00:00Z",
      route: "/post/alice/post",
      unread: true
    },
    {
      id: "m",
      kind: "message" as const,
      name: "Carol",
      description: "sent you a message",
      preview: "See you soon",
      createdAt: "2026-09-07T00:00:00Z",
      route: "/messages/conversation",
      unread: false
    }
  ];
  render(
    <MemoryRouter>
      <ActivityPage
        items={items}
        requests={[]}
        replyRequests={[]}
        loading={false}
        error=""
        onRefresh={vi.fn()}
        onRead={read}
        onContactDecision={vi.fn()}
        onReplyDecision={vi.fn()}
      />
    </MemoryRouter>
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Unread" }));
  expect(screen.queryByText("Carol")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Bob/ })).toHaveAttribute("href", "/post/alice/post");
  await user.click(screen.getByRole("button", { name: "Mark all read" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
  expect(screen.getByText("Hello")).toBeVisible();
});
