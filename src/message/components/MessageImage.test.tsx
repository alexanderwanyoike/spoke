// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { MessageSession } from "../MessageSession";
import { MessageImage } from "./MessageImage";
import { gatewayFixture } from "../../test/messages";
import type { SpokeMessageAttachment } from "../../media";
const attachment: SpokeMessageAttachment = {
  id: "image",
  kind: "image",
  contentId: "cid",
  mimeType: "image/png",
  size: 3,
  encrypted: true,
  alt: "A hill at sunset"
};
beforeEach(() => {
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:photo"), revokeObjectURL: vi.fn() });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("retries a failed load, opens the image accessibly and returns focus after Escape", async () => {
  const { gateway } = gatewayFixture();
  gateway.loadImage.mockRejectedValueOnce(new Error("Offline"));
  const user = userEvent.setup();
  render(
    <MessageSession gateway={gateway}>
      <MessageImage attachment={attachment} />
    </MessageSession>
  );
  expect(screen.getByText("Loading image…")).toBeVisible();
  expect(await screen.findByText("Image unavailable")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  const trigger = await screen.findByRole("button", { name: "Open image: A hill at sunset" });
  await user.click(trigger);
  expect(screen.getByRole("dialog", { name: "A hill at sunset" })).toBeVisible();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
  expect(gateway.loadImage).toHaveBeenCalledTimes(2);
});

it("shows decoding failure and releases the previous image when retrying or unmounting", async () => {
  const { gateway } = gatewayFixture();
  const user = userEvent.setup();
  const view = render(
    <MessageSession gateway={gateway}>
      <MessageImage attachment={attachment} />
    </MessageSession>
  );
  const image = await screen.findByRole("img", { name: attachment.alt });
  fireEvent.error(image);
  expect(screen.getByText("This image could not be displayed.")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("img", { name: attachment.alt });
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
});

it("does not create a preview URL for an image that finishes loading after unmount", async () => {
  const { gateway } = gatewayFixture();
  let finish!: (blob: Blob) => void;
  gateway.loadImage.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const view = render(
    <MessageSession gateway={gateway}>
      <MessageImage attachment={attachment} />
    </MessageSession>
  );
  view.unmount();
  await act(async () => finish(new Blob(["late image"])));
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
