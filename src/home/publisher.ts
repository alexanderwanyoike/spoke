import type { SpokeApp } from "../data";
import { toDataImageAttachment } from "../data";
import { validateImageAttachment } from "../media";
import type { PublicImages } from "../media/public";
import { PostInput, type PostPhoto } from "./input";

export function createPostPublisher(data: SpokeApp, identity: string, images: PublicImages) {
  return {
    async publish(input: PostInput, photos: PostPhoto[], displayName = identity) {
      const draft = PostInput.parse(input);
      if (!draft.body && !draft.website && photos.length === 0)
        throw new Error("Write something, add an image or share a link.");
      if (photos.length > 6) throw new Error("Choose up to six images per post.");
      photos.forEach((photo) => validateImageAttachment(photo.file));
      const attachments = await Promise.all(
        photos.map(async (photo) =>
          toDataImageAttachment(await images.upload(photo.file, photo.alt))
        )
      );
      return data.posts.create({
        author: identity,
        displayName,
        body: draft.body,
        title: draft.title,
        createdAt: new Date(),
        link: draft.website
          ? { url: draft.website, title: draft.linkTitle || draft.website }
          : undefined,
        attachments
      });
    }
  };
}
