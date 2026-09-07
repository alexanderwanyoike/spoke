// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "@testing-library/jest-dom/vitest";
import { SpokeData } from "../data";
import { PostPage } from "./PostPage";
afterEach(cleanup);
it("edits an owned post, confirms deletion and offers Undo", async () => {
  const data = SpokeData.test({ identity: "alice.jolt" });
  const post = await data.posts.create({
    author: "alice.jolt",
    body: "Original post",
    title: "",
    createdAt: new Date()
  });
  const id = post.ref.path.split("/").pop();
  render(
    <MemoryRouter initialEntries={[`/post/alice.jolt/${id}`]}>
      <Routes>
        <Route
          path="/post/:identity/:postId"
          element={
            <PostPage
              identity="alice.jolt"
              gateway={{ connect: async () => data, images: { upload: vi.fn(), load: vi.fn() } }}
            />
          }
        />
      </Routes>
    </MemoryRouter>
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Edit post" }));
  await user.clear(screen.getByRole("textbox", { name: "Post" }));
  await user.type(screen.getByRole("textbox", { name: "Post" }), "Edited post");
  await user.click(screen.getByRole("button", { name: "Save post" }));
  expect(await screen.findByText("Edited post")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Delete post" }));
  await user.click(
    within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete post" })
  );
  expect(await screen.findByRole("heading", { name: "Post deleted" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Undo deletion" }));
  expect(await screen.findByText("Edited post")).toBeVisible();
});
