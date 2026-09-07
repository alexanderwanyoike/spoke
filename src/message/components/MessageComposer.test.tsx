// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { MessageComposer } from "./MessageComposer";
import { createDrafts } from "../drafts";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("keeps a failed draft when switching conversations and retries the same message", async () => {
  const user = userEvent.setup();
  const drafts = createDrafts();
  const send = vi
    .fn()
    .mockRejectedValueOnce(new Error("Jolt is offline"))
    .mockResolvedValue(undefined);
  const view = render(
    <MessageComposer key="bob" recipient="bob" name="Bob" drafts={drafts} send={send} />
  );
  await user.type(screen.getByRole("textbox"), "Keep this{Enter}");
  expect(await screen.findByText("Jolt is offline")).toBeVisible();
  const attempt = send.mock.calls[0][1];
  view.rerender(
    <MessageComposer key="carol" recipient="carol" name="Carol" drafts={drafts} send={send} />
  );
  expect(screen.getByRole("textbox")).toHaveValue("");
  view.rerender(
    <MessageComposer key="bob" recipient="bob" name="Bob" drafts={drafts} send={send} />
  );
  expect(screen.getByRole("textbox")).toHaveValue("Keep this");
  await user.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue(""));
  expect(send.mock.calls[1][1]).toBe(attempt);
});

it("preserves new typing while a send is pending and ignores duplicate submission", async () => {
  const user = userEvent.setup();
  let complete!: () => void;
  const send = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      })
  );
  render(<MessageComposer recipient="bob" name="Bob" drafts={createDrafts()} send={send} />);
  await user.type(screen.getByRole("textbox"), "First{Enter}");
  await user.type(screen.getByRole("textbox"), " still editing{Enter}");
  expect(send).toHaveBeenCalledTimes(1);
  complete();
  await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeEnabled());
  expect(screen.getByRole("textbox")).toHaveValue("First still editing");
});

it("sends an image without text and rejects unsupported files before sending", async () => {
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() });
  const user = userEvent.setup({ applyAccept: false });
  const send = vi.fn().mockResolvedValue(undefined);
  render(<MessageComposer recipient="bob" name="Bob" drafts={createDrafts()} send={send} />);
  const picker = screen.getByLabelText("Attach images");
  await user.upload(picker, new File(["bad"], "file.txt", { type: "text/plain" }));
  expect(await screen.findByText("Images must be JPEG, PNG, or WebP.")).toBeVisible();
  expect(send).not.toHaveBeenCalled();
  await user.upload(picker, new File(["image"], "photo.png", { type: "image/png" }));
  await user.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  expect(send.mock.calls[0][1].images[0].file.name).toBe("photo.png");
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
});

it("sends once and clears the textbox through both button and keyboard submission", async () => {
  const user = userEvent.setup();
  const send = vi.fn().mockResolvedValue(undefined);
  render(<MessageComposer recipient="bob.jolt" name="Bob" drafts={createDrafts()} send={send} />);
  const input = screen.getByRole("textbox", { name: "Message Bob" });
  await user.type(input, "Hello Bob");
  await user.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(input).toHaveValue(""));
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0]).toBe("bob.jolt");
  expect(send.mock.calls[0][1].body).toBe("Hello Bob");
  await user.type(input, "Another message{Enter}");
  await waitFor(() => expect(input).toHaveValue(""));
  expect(send).toHaveBeenCalledTimes(2);
});

it("edits image descriptions without releasing previews and removes only the chosen attachment", async () => {
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn((file: File) => `blob:${file.name}`),
    revokeObjectURL: vi.fn()
  });
  const user = userEvent.setup();
  const send = vi.fn().mockResolvedValue(undefined);
  render(<MessageComposer recipient="bob" name="Bob" drafts={createDrafts()} send={send} />);
  await user.upload(screen.getByLabelText("Attach images"), [
    new File(["a"], "one.png", { type: "image/png" }),
    new File(["b"], "two.png", { type: "image/png" })
  ]);
  await user.type(screen.getByRole("textbox", { name: "Description for two.png" }), "A mountain");
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Remove one.png" }));
  expect(screen.queryByRole("img", { name: "one.png" })).not.toBeInTheDocument();
  expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:one.png");
  await user.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(send).toHaveBeenCalledOnce());
  expect(send.mock.calls[0][1].images).toHaveLength(1);
  expect(send.mock.calls[0][1].images[0].alt).toBe("A mountain");
});

it("validates empty messages and preserves Shift+Enter as a newline", async () => {
  const user = userEvent.setup();
  const send = vi.fn().mockResolvedValue(undefined);
  render(<MessageComposer recipient="bob" name="Bob" drafts={createDrafts()} send={send} />);
  await user.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByText("Write a message or attach an image.")).toBeVisible();
  expect(send).not.toHaveBeenCalled();
  await user.type(
    screen.getByRole("textbox", { name: "Message Bob" }),
    "First{Shift>}{Enter}{/Shift}Second"
  );
  expect(screen.getByRole("textbox", { name: "Message Bob" })).toHaveValue("First\nSecond");
  expect(send).not.toHaveBeenCalled();
});
