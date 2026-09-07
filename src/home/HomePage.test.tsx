// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom/vitest";
import { SpokeData } from "../data";
import { HomePage } from "./HomePage";
afterEach(cleanup);
it("renders actual typed posts and a public link without invented feed items", async () => {
  const data = SpokeData.test({ identity: "alice.jolt" });
  await data.posts.create({
    author: "alice.jolt",
    displayName: "Alice",
    body: "A real typed post",
    title: "",
    createdAt: new Date(),
    link: { url: "https://example.com/article", title: "A useful article" }
  });
  render(
    <MemoryRouter>
      <HomePage
        identity="alice.jolt"
        contacts={[]}
        profiles={{ load: vi.fn(), save: vi.fn() }}
        gateway={{ connect: async () => data, images: { load: vi.fn(), upload: vi.fn() } }}
      />
    </MemoryRouter>
  );
  expect(await screen.findByText("A real typed post")).toBeVisible();
  expect(screen.getByRole("link", { name: /A useful article/ })).toHaveAttribute(
    "href",
    "https://example.com/article"
  );
});
