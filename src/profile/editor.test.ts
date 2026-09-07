import { expect, it, vi } from "vitest";
import { createProfileEditor } from "./editor";

it("validates a profile draft before uploading or saving", async () => {
  const repository = { load: vi.fn(), save: vi.fn() };
  const editor = createProfileEditor(repository);
  await expect(
    editor.save(
      { displayName: "", bio: "", location: "", pronouns: "", website: "javascript:alert(1)" },
      null
    )
  ).rejects.toThrow();
  expect(repository.save).not.toHaveBeenCalled();
});

it("normalizes the draft and keeps the version observed when editing began", async () => {
  const repository = {
    load: vi.fn(),
    save: vi.fn().mockResolvedValue({ profile: null, contentId: "new" })
  };
  await createProfileEditor(repository).save(
    {
      displayName: "  Alice  ",
      bio: " Hi ",
      location: "",
      pronouns: "",
      website: "https://example.com"
    },
    "original",
    undefined
  );
  expect(repository.save).toHaveBeenCalledWith(
    expect.objectContaining({ displayName: "Alice", bio: "Hi" }),
    "original",
    undefined
  );
});
