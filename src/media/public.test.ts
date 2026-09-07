import { expect, it, vi } from "vitest";
import { createPublicImages } from "./public";
it("rejects oversized public images before upload", async () => {
  const publish = vi.fn();
  const images = createPublicImages("token", { publish, fetch: vi.fn() });
  const file = new File([new Uint8Array(6 * 1024 * 1024)], "large.png", { type: "image/png" });
  await expect(images.upload(file)).rejects.toThrow(/5 MB/);
  expect(publish).not.toHaveBeenCalled();
});
