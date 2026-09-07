import { State, type PresentItem } from "jolt-sdk/data";
import type { Post, SpokeApp } from "../data";
import type { FeedItem } from "../feed";
import { sameIdentity } from "../follow";
import type { SpokeAttachment } from "../media";
import { PostInput } from "./input";

type OwnedPost = Extract<
  Awaited<ReturnType<SpokeApp["posts"]["get"]>>,
  { state: typeof State.Present }
>;
export type PostActions = {
  edit(input: PostInput): Promise<ReadyPost>;
  remove(): Promise<() => Promise<ReadyPost>>;
};
export type ReadyPost = { kind: "ready"; item: FeedItem; actions: PostActions | null };
export type PostDocument = ReadyPost | { kind: "unavailable" } | { kind: "deleted" };

function feedItem(item: PresentItem<Post>, owner: string): FeedItem {
  const value = item.value;
  if (!sameIdentity(value.author, owner))
    throw new Error("The post does not belong to its publishing identity.");
  return {
    source: "local",
    address: `${owner}${item.ref.path}`,
    post: {
      schema: "spoke.post.v2",
      id: item.ref.path.split("/").pop()!,
      author: owner,
      displayName: value.displayName,
      body: value.body,
      title: value.title,
      createdAt: value.createdAt.toISOString(),
      path: item.ref.path,
      attachments: value.attachments as SpokeAttachment[] | undefined,
      link: value.link
    }
  };
}
function owned(item: OwnedPost, identity: string): ReadyPost {
  return {
    kind: "ready",
    item: feedItem(item, identity),
    actions: {
      async edit(input) {
        const draft = PostInput.parse(input);
        if (!draft.body && !draft.website && !item.value.attachments?.length)
          throw new Error("A post needs text, images or a link.");
        return owned(
          await item.update({
            body: draft.body,
            title: draft.title,
            link: draft.website
              ? { url: draft.website, title: draft.linkTitle || draft.website }
              : undefined
          }),
          identity
        );
      },
      async remove() {
        const deleted = await item.delete();
        const value = {
          ...item.value,
          attachments: item.value.attachments?.map((attachment) => ({ ...attachment }))
        };
        return async () => owned(await deleted.restore(value), identity);
      }
    }
  };
}
export async function openPost(
  data: SpokeApp,
  localIdentity: string,
  owner: string,
  id: string
): Promise<PostDocument> {
  const ref = { identity: owner, path: `/spoke/posts/${id}` };
  if (sameIdentity(localIdentity, owner)) {
    const item = await data.posts.get({ ...ref, identity: localIdentity });
    if (item.state === State.Deleted) return { kind: "deleted" };
    if (item.state !== State.Present) return { kind: "unavailable" };
    return owned(item, owner);
  }
  const item = await data.posts.for(owner).get(ref);
  if (item.state === State.Deleted) return { kind: "deleted" };
  if (item.state !== State.Present) return { kind: "unavailable" };
  return { kind: "ready", item: feedItem(item, owner), actions: null };
}
