import { decryptEncryptedTarget, publishEncryptedBinary } from "../jolt";
import {
  attachmentFetchTarget,
  createEncryptedImageAttachmentReference,
  messageMediaPath,
  type SpokeMessageAttachment
} from "../media";
import type { DraftImage } from "./drafts";

export interface MessageMedia {
  upload(messageId: string, image: DraftImage, recipient: string): Promise<SpokeMessageAttachment>;
  load(attachment: SpokeMessageAttachment): Promise<Blob>;
}

type MediaOperations = {
  publish: typeof publishEncryptedBinary;
  decrypt: typeof decryptEncryptedTarget;
};

export function createMessageMedia(
  identity: string,
  token: string,
  operations: MediaOperations = { publish: publishEncryptedBinary, decrypt: decryptEncryptedTarget }
): MessageMedia {
  return {
    async upload(messageId, image, recipient) {
      const published = await operations.publish(
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
    },
    async load(attachment) {
      const result = await operations.decrypt(token, attachmentFetchTarget(attachment));
      return new Blob([new Uint8Array(result.plaintext)], { type: attachment.mimeType });
    }
  };
}
