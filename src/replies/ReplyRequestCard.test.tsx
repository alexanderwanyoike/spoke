// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom/vitest";
import { ReplyRequestCard } from "./ReplyRequestCard";
afterEach(cleanup);
it("keeps a failed review decision actionable", async () => {
  const decide = vi
    .fn()
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValueOnce(undefined);
  const reply = {
    schema: "spoke.reply.v2" as const,
    id: "r",
    postId: "p",
    postAuthor: "alice.jolt",
    parent: "p",
    sender: "bob.jolt",
    body: "Hello",
    createdAt: "2026-09-07T00:00:00Z"
  };
  render(
    <MemoryRouter>
      <ReplyRequestCard item={{ ingressId: "inbox", reply }} onDecide={decide} />
    </MemoryRouter>
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Include reply" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
  await user.click(screen.getByRole("button", { name: "Decline reply" }));
  expect(decide).toHaveBeenLastCalledWith("inbox", "rejected");
});
