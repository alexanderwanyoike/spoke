import { fetchTarget, makeId, publishBinary } from "../jolt";
import {
  attachmentFetchTarget,
  createImageAttachmentReference,
  mediaPath,
  validateImageAttachment,
  type SpokeAttachment,
  type ImageAttachmentMimeType
} from "../media";
export interface PublicImages {
  upload(file: File, alt?: string): Promise<SpokeAttachment>;
  load(attachment: SpokeAttachment): Promise<Blob>;
}
export function createPublicImages(
  token: string,
  operations = { publish: publishBinary, fetch: fetchTarget }
): PublicImages {
  return {
    async upload(file, alt = "") {
      validateImageAttachment(file);
      const id = makeId("image");
      const published = await operations.publish(token, mediaPath(id), file, {
        fileName: file.name,
        mimeType: file.type
      });
      return createImageAttachmentReference({
        id,
        published,
        mimeType: file.type as ImageAttachmentMimeType,
        alt
      });
    },
    async load(attachment) {
      const result = await operations.fetch(token, attachmentFetchTarget(attachment));
      return new Blob([new Uint8Array(result.data)], { type: attachment.mimeType });
    }
  };
}
