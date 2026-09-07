// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AccountIdentity } from "./AccountIdentity";

afterEach(cleanup);

it("replaces the identity fallback with the saved profile name", async () => {
  const profile = { load: vi.fn().mockResolvedValue("Alice Jones") };
  render(<AccountIdentity identity="alice.jolt" profile={profile} />);
  expect(await screen.findByText("Alice Jones")).toBeVisible();
  expect(screen.getByLabelText("Your profile")).toHaveAttribute("title", "alice.jolt");
});

it.each([null, new Error("Offline")])(
  "keeps the identity when a name is unavailable",
  async (result) => {
    const load = vi.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    });
    await act(async () => render(<AccountIdentity identity="alice.jolt" profile={{ load }} />));
    expect(screen.getByText("alice.jolt")).toBeVisible();
  }
);

it("ignores a profile response after switching accounts", async () => {
  let finish!: (name: string) => void;
  const alice = {
    load: () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      })
  };
  const bob = { load: vi.fn().mockResolvedValue("Bob") };
  const view = render(<AccountIdentity identity="alice.jolt" profile={alice} />);
  view.rerender(<AccountIdentity identity="bob.jolt" profile={bob} />);
  expect(await screen.findByText("Bob")).toBeVisible();
  await act(async () => finish("Alice"));
  expect(screen.queryByText("Alice")).not.toBeInTheDocument();
});
