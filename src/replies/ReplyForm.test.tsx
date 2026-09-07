// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ReplyForm } from "./ReplyForm";
afterEach(cleanup);
it("retains the public reply draft and stable ID when publication fails", async () => {
  const submit = vi
    .fn()
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValueOnce(undefined);
  render(
    <ReplyForm
      owner="bob.jolt"
      postId="post"
      parent={{ id: "post", name: "the post" }}
      onSubmit={submit}
      onCancel={vi.fn()}
    />
  );
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox", { name: "Your reply" }), "Keep this thought");
  await user.click(screen.getByRole("button", { name: "Publish reply" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
  expect(screen.getByRole("textbox", { name: "Your reply" })).toHaveValue("Keep this thought");
  await user.click(screen.getByRole("button", { name: "Publish reply" }));
  expect(submit.mock.calls[1][0]).toEqual(submit.mock.calls[0][0]);
});
