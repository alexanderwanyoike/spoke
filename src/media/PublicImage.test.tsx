// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { PublicImage } from "./PublicImage";
const attachment = { id: "photo", kind: "image" as const, contentId: "cid", mimeType: "image/png" as const, size: 10, alt: "Portrait" };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("retries an unavailable image without replacing the surrounding content", async () => {
  vi.stubGlobal("URL", { createObjectURL: vi.fn().mockReturnValue("blob:portrait"), revokeObjectURL: vi.fn() });
  const images = { upload: vi.fn(), load: vi.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValue(new Blob(["image"])) };
  render(<><p>Profile biography</p><PublicImage attachment={attachment} images={images} /></>);
  await userEvent.click(await screen.findByRole("button", { name: "Retry image" }));
  expect(await screen.findByAltText("Portrait")).toBeVisible();
  expect(screen.getByText("Profile biography")).toBeVisible();
});
it("releases the image URL on unmount", async () => {
  const revoke = vi.fn();
  vi.stubGlobal("URL", { createObjectURL: vi.fn().mockReturnValue("blob:portrait"), revokeObjectURL: revoke });
  const images = { upload: vi.fn(), load: vi.fn().mockResolvedValue(new Blob(["image"])) };
  const view = render(<PublicImage attachment={attachment} images={images} />);
  await screen.findByAltText("Portrait"); view.unmount();
  expect(revoke).toHaveBeenCalledWith("blob:portrait");
});
