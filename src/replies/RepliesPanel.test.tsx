// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom/vitest";
import { createFakeJolt } from "jolt-sdk/testing";
import { ReplyRepository } from "./repository";
import { ReplyService } from "./service";
import { RepliesPanel } from "./RepliesPanel";
afterEach(cleanup);
it("writes a public reply and can reply to that reply", async () => {
  const node = createFakeJolt("bob.jolt");
  const repository = new ReplyRepository(node.client);
  const service = new ReplyService(node.identity, node.client, repository, async () => true);
  render(
    <MemoryRouter>
      <RepliesPanel
        identity={node.identity}
        owner={node.identity}
        postId="post"
        gateway={{ repository, service, inbox: service.inbox }}
      />
    </MemoryRouter>
  );
  const user = userEvent.setup();
  await user.type(await screen.findByRole("textbox", { name: "Your reply" }), "First thought");
  await user.click(screen.getByRole("button", { name: "Publish reply" }));
  expect(await screen.findByText("First thought")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Reply to bob.jolt" }));
  await user.type(screen.getByRole("textbox", { name: "Your reply" }), "Second thought");
  await user.click(screen.getByRole("button", { name: "Publish reply" }));
  expect(await screen.findByText("Second thought")).toBeVisible();
  expect((await repository.load(node.identity, "post")).roots[0].children).toHaveLength(1);
});
