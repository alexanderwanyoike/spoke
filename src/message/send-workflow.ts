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

class MessageOutbox {
  readonly confirmed = new Set<string>();
  private attempts = new Map<string, SpokeMessage>();
  private uploaded = new Map<string, SpokeMessageAttachment>();
  private pending = new Map<string, Promise<void>>();

  constructor(private dependencies: Dependencies) {}

  send = (recipient: string, draft: MessageDraft, signal?: AbortSignal): Promise<void> => {
    if (this.confirmed.has(draft.id)) return Promise.resolve();
    const pending = this.pending.get(draft.id);
    if (pending) return pending;
    const operation = this.deliver(recipient, draft, signal).finally(() =>
      this.pending.delete(draft.id)
    );
    this.pending.set(draft.id, operation);
    return operation;
  };

  private async deliver(recipient: string, draft: MessageDraft, signal?: AbortSignal) {
    MessageInput.parse(draft);
    signal?.throwIfAborted();
    await this.dependencies.authorize(recipient);
    signal?.throwIfAborted();
    const message = await this.prepare(recipient, draft, signal);
    signal?.throwIfAborted();
    await sendMessage(this.dependencies.sdk, message, this.dependencies.store);
    this.confirmed.add(draft.id);
    this.attempts.delete(draft.id);
    draft.images.forEach((image) => this.uploaded.delete(`${draft.id}/${image.id}`));
  }

  private async prepare(
    recipient: string,
    draft: MessageDraft,
    signal?: AbortSignal
  ): Promise<SpokeMessage> {
    const existing = this.attempts.get(draft.id);
    if (existing) return existing;
    const attachments: SpokeMessageAttachment[] = [];
    for (const image of draft.images)
      attachments.push(await this.upload(draft.id, image, recipient, signal));
    const message: SpokeMessage = {
      schema: "spoke.message.v2",
      id: draft.id,
      conversationId: conversationIdForParticipants([this.dependencies.identity, recipient]),
      sender: this.dependencies.identity,
      recipients: [recipient],
      body: draft.body.trim(),
      createdAt: new Date().toISOString(),
      attachments
    };
    // A retry publishes the same immutable message, including its original timestamp.
    this.attempts.set(draft.id, message);
    return message;
  }

  private async upload(
    messageId: string,
    image: DraftImage,
    recipient: string,
    signal?: AbortSignal
  ) {
    const key = `${messageId}/${image.id}`;
    const existing = this.uploaded.get(key);
    if (existing) return existing;
    signal?.throwIfAborted();
    const attachment = await this.dependencies.upload(messageId, image, recipient);
    this.uploaded.set(key, attachment);
    return attachment;
  }
}

export function createMessageSender(dependencies: Dependencies) {
  const outbox = new MessageOutbox(dependencies);
  return { send: outbox.send, confirmed: outbox.confirmed };
}
