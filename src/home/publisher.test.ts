import { expect, it, vi } from "vitest";
import { SpokeData } from "../data";
import { createPostPublisher } from "./publisher";
it("rejects an empty post before publishing or uploading", async () => {
  const data = SpokeData.test({ identity: "alice.jolt" });
  const images = { upload: vi.fn(), load: vi.fn() };
  await expect(
    createPostPublisher(data, "alice.jolt", images).publish(
      { body: "  ", title: "", website: "", linkTitle: "" },
      []
    )
  ).rejects.toThrow();
  expect(images.upload).not.toHaveBeenCalled();
});

it("publishes an image-only post through the typed collection with no required title", async () => {
  const data = SpokeData.test({ identity: "alice.jolt" });
  const images = {
    load: vi.fn(),
    upload: vi.fn().mockResolvedValue({
      id: "photo",
      kind: "image",
      contentId: "image-cid",
      mimeType: "image/png",
      size: 5,
      alt: "A portrait"
    })
  };
  const photo = {
    file: new File(["image"], "portrait.png", { type: "image/png" }),
    alt: "A portrait"
  };
  const post = await createPostPublisher(data, "alice.jolt", images).publish(
    { title: "", body: "", website: "", linkTitle: "" },
    [photo],
    "Alice"
  );
  expect(post.value).toMatchObject({
    author: "alice.jolt",
    displayName: "Alice",
    title: "",
    body: "",
    attachments: [{ contentId: "image-cid", alt: "A portrait" }]
  });
  expect((await data.posts.get(post.ref)).state).toBe(post.state);
});

it("keeps the destination and title of a link-only post", async () => {
  const data = SpokeData.test({ identity: "alice.jolt" });
  const post = await createPostPublisher(data, "alice.jolt", {
    upload: vi.fn(),
    load: vi.fn()
  }).publish(
    { title: "", body: "", website: "https://example.com/article", linkTitle: "A good read" },
    []
  );
  expect(post.value).toMatchObject({
    link: { url: "https://example.com/article", title: "A good read" }
  });
});
