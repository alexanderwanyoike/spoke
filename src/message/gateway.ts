import { z } from "zod";
import { createStore } from "../common/store";
import { hasAcceptedContactForIdentity, loadContacts, readContacts, sameIdentity } from "../follow";
import { createJoltSdk, decryptEncryptedTarget, publishEncryptedBinary } from "../jolt";
import {
  attachmentFetchTarget,
  createEncryptedImageAttachmentReference,
  messageMediaPath,
  type SpokeMessageAttachment
} from "../media";
import { loadConversations } from "./loaders";
import { readConversations } from "./queries";
import { conversationViews, type MessagesData } from "./view-model";
import { createMessageSender } from "./send-workflow";
import { receiveMessages } from "./receive";
import type { MessageDraft } from "./drafts";

export interface MessagesGateway {
  load(signal?: AbortSignal): Promise<MessagesData>;
  send(recipient: string, draft: MessageDraft, signal?: AbortSignal): Promise<void>;
  loadImage(attachment: SpokeMessageAttachment): Promise<Blob>;
  confirmed: ReadonlySet<string>;
}

const ContactRecord = z.object({
  schema: z.literal("spoke.contact.v1"),
  identity: z.string().min(1),
  displayName: z.string(),
  relationship: z.enum(["accepted", "requested", "local"]),
  updatedAt: z.string(),
  removed: z.boolean().optional()
});

export function createMessagesGateway(identity: string, token: string): MessagesGateway {
  const sdk = createJoltSdk(() => token);
  const store = createStore();
  async function refreshContacts() {
    // Fetch first so the existing contact loader cannot disguise a failed inventory as an empty graph.
    const inventory = await sdk.listPublished();
    await loadContacts(
      {
        listPublished: async () => inventory,
        readEncrypted: (ref, decode) =>
          sdk.readEncrypted(ref, (value) => {
            const parsed = ContactRecord.safeParse(value);
            return parsed.success ? decode(parsed.data) : null;
          })
      },
      identity,
      store
    );
    return inventory;
  }
  const sender = createMessageSender({
    identity,
    sdk,
    store,
    async authorize(recipient) {
      await refreshContacts();
      if (
        !hasAcceptedContactForIdentity(readContacts(identity, store), recipient) ||
        sameIdentity(identity, recipient)
      ) {
        throw new Error("You can send messages only to accepted contacts.");
      }
    },
    async upload(messageId, image, recipient) {
      const published = await publishEncryptedBinary(
        token,
        messageMediaPath(messageId, image.id),
        image.file,
        {
          mimeType: image.mimeType,
          recipients: [identity, recipient]
        }
      );
      return createEncryptedImageAttachmentReference({
        id: image.id,
        published,
        mimeType: image.mimeType,
        alt: image.alt
      });
    }
  });
  return {
    ...sender,
    async load(signal) {
      signal?.throwIfAborted();
      const inventory = await refreshContacts();
      const pendingCount = await receiveMessages(sdk, identity, store, signal);
      const { unavailableCount } = await loadConversations(
        { ...sdk, listPublished: async () => inventory },
        identity,
        store
      );
      return {
        conversations: conversationViews(
          identity,
          readContacts(identity, store),
          readConversations(identity, store)
        ),
        pendingCount,
        unavailableCount
      };
    },
    async loadImage(attachment) {
      const result = await decryptEncryptedTarget(token, attachmentFetchTarget(attachment));
      return new Blob([new Uint8Array(result.plaintext)], { type: attachment.mimeType });
    }
  };
}
