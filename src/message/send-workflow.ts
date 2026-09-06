import type { Store } from "../common/store";
import type { SpokeMessageAttachment } from "../media";
import { sendMessage, type MessageSender } from "./commands";
import type { DraftImage, MessageDraft } from "./drafts";
import { MessageInput } from "./input";
import { conversationIdForParticipants, type SpokeMessage } from "./model";

type Dependencies = {
  identity: string;
  sdk: MessageSender;
  store: Store;
  authorize(recipient: string): Promise<void>;
  upload(messageId: string, image: DraftImage, recipient: string): Promise<SpokeMessageAttachment>;
};

export function createMessageSender({ identity, sdk, store, authorize, upload }: Dependencies) {
  const attempts = new Map<string, SpokeMessage>();
  const uploaded = new Map<string, SpokeMessageAttachment>();
  const pending = new Map<string, Promise<void>>();
  const confirmed = new Set<string>();
  async function perform(recipient: string, draft: MessageDraft, signal?: AbortSignal) {
    MessageInput.parse(draft);
    signal?.throwIfAborted();
    await authorize(recipient);
    signal?.throwIfAborted();
    let message = attempts.get(draft.id);
    if (!message) {
      const attachments: SpokeMessageAttachment[] = [];
      for (const image of draft.images) {
        const key = `${draft.id}/${image.id}`;
        let attachment = uploaded.get(key);
        if (!attachment) {
          signal?.throwIfAborted();
          attachment = await upload(draft.id, image, recipient);
          uploaded.set(key, attachment);
        }
        attachments.push(attachment);
      }
      message = {
        schema: "spoke.message.v2",
        id: draft.id,
        conversationId: conversationIdForParticipants([identity, recipient]),
        sender: identity,
        recipients: [recipient],
        body: draft.body.trim(),
        createdAt: new Date().toISOString(),
        attachments
      };
      attempts.set(draft.id, message);
    }
    signal?.throwIfAborted();
    await sendMessage(sdk, message, store);
    confirmed.add(draft.id);
    attempts.delete(draft.id);
    draft.images.forEach((image) => uploaded.delete(`${draft.id}/${image.id}`));
  }
  return {
    confirmed,
    send(recipient: string, draft: MessageDraft, signal?: AbortSignal): Promise<void> {
      if (confirmed.has(draft.id)) return Promise.resolve();
      const current = pending.get(draft.id);
      if (current) return current;
      const operation = perform(recipient, draft, signal).finally(() => pending.delete(draft.id));
      pending.set(draft.id, operation);
      return operation;
    }
  };
}
