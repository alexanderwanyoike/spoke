// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { Composer } from "./Composer";
afterEach(cleanup);
it("keeps the post draft when publishing fails", async () => {
  const publish = vi.fn().mockRejectedValue(new Error("Offline"));
  render(<Composer onPublish={publish} onClose={vi.fn()} />);
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox", { name: "Post" }), "Something worth sharing");
  await user.click(screen.getByRole("button", { name: "Publish post" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
  expect(screen.getByRole("textbox", { name: "Post" })).toHaveValue("Something worth sharing");
});
