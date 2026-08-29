import { Subscription } from "jolt-sdk/data";

import type { SpokeApp } from "../data";
import { sameIdentity } from "../follow";
import type { JoltAppendSdk } from "../jolt";
import type { FeedReader } from "./loaders";
import { decodePost, POSTS_PREFIX } from "./model";

export type LegacyPostReader = FeedReader & Pick<JoltAppendSdk, "enumerate">;

export async function migrateLegacyPosts(
  data: SpokeApp,
  identity: string,
  legacy: LegacyPostReader,
): Promise<void> {
  const subscription = await Subscription.create(data.posts.for(identity));
  const currentPosts = await subscription.get();
  const knownThreads = new Set(
    currentPosts.flatMap((item) => item.value.threadPath ? [item.value.threadPath] : []),
  );
  const records = await legacy.enumerate(identity, POSTS_PREFIX);

  for (const record of records) {
    try {
      const result = await legacy.readContent(
        record.contentId,
        { identity, path: record.path },
        record.deviceSequence,
        decodePost,
      );
      if (!result || !sameIdentity(result.value.author, identity)) continue;

      const post = result.value;
      const threadPath = post.threadPath ?? `/spoke/accepted/${post.id}/`;
      if (knownThreads.has(threadPath)) continue;

      const createdAt = new Date(post.createdAt);
      if (Number.isNaN(createdAt.valueOf())) continue;
      await data.posts.create({
        author: post.author,
        displayName: post.displayName,
        title: post.title,
        body: post.body,
        createdAt,
        threadPath,
        attachments: post.attachments?.map(({ address, ...attachment }) => ({
          ...attachment,
          ...(address ? { address } : {}),
        })),
      });
      knownThreads.add(threadPath);
    } catch {
      // One malformed historical record must not block the remaining migration.
    }
  }
}
