import { makeId } from "../jolt";
import type { ImageAttachmentMimeType } from "../media";

export type DraftImage = {
  id: string;
  file: File;
  previewUrl: string;
  mimeType: ImageAttachmentMimeType;
  alt: string;
};
export type MessageDraft = { id: string; body: string; images: DraftImage[] };

export function createDrafts() {
  const drafts = new Map<string, MessageDraft>();
  function get(recipient: string): MessageDraft {
    let draft = drafts.get(recipient);
    if (!draft) {
      draft = { id: makeId("message"), body: "", images: [] };
      drafts.set(recipient, draft);
    }
    return draft;
  }
  function update(recipient: string, value: Pick<MessageDraft, "body" | "images">) {
    const previous = get(recipient);
    for (const image of previous.images) {
      if (!value.images.some((next) => next.previewUrl === image.previewUrl))
        URL.revokeObjectURL(image.previewUrl);
    }
    const draft = { ...value, id: makeId("message") };
    drafts.set(recipient, draft);
    return draft;
  }
  return {
    get,
    update,
    clearSubmitted(recipient: string, submitted: MessageDraft) {
      if (drafts.get(recipient) !== submitted) return false;
      update(recipient, { body: "", images: [] });
      return true;
    },
    dispose() {
      for (const draft of drafts.values()) {
        for (const image of draft.images) URL.revokeObjectURL(image.previewUrl);
      }
      drafts.clear();
    }
  };
}
export type MessageDrafts = ReturnType<typeof createDrafts>;
