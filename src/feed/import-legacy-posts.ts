import { Subscription } from "jolt-sdk/data";

import { toDataImageAttachment, type Post, type SpokeApp } from "../data";
import { normalizeIdentity, sameIdentity } from "../follow";
import type { JoltAppendSdk } from "../jolt";
import type { FeedReader } from "./loaders";
import { decodePost, POSTS_PREFIX, type SpokePost } from "./model";

export type LegacyPostReader = FeedReader & Pick<JoltAppendSdk, "enumerate">;

export type SkippedLegacyPost = {
  path: string;
  reason: "unreadable" | "wrong-author" | "invalid-date";
};

export type LegacyPostImportResult = {
  imported: number;
  skipped: readonly SkippedLegacyPost[];
};

export type LegacyImportCompletionStore = Pick<Storage, "getItem" | "setItem">;

export type LegacyImportOptions = {
  completionStore?: LegacyImportCompletionStore;
};

type LegacyPosts = {
  posts: SpokePost[];
  skipped: SkippedLegacyPost[];
};

const activeImports = new Map<string, Promise<LegacyPostImportResult>>();
const COMPLETION_KEY_PREFIX = "spoke.data-import.legacy-posts.v1";

function defaultCompletionStore(): LegacyImportCompletionStore | undefined {
  return typeof localStorage === "undefined" ? undefined : localStorage;
}

async function readLegacyPosts(reader: LegacyPostReader, identity: string): Promise<LegacyPosts> {
  const records = await reader.enumerate(identity, POSTS_PREFIX);
  const posts: SpokePost[] = [];
  const skipped: SkippedLegacyPost[] = [];

  for (const record of records) {
    try {
      const result = await reader.readContent(
        record.contentId,
        { identity, path: record.path },
        record.deviceSequence,
        decodePost
      );
      if (!result) {
        skipped.push({ path: record.path, reason: "unreadable" });
      } else if (!sameIdentity(result.value.author, identity)) {
        skipped.push({ path: record.path, reason: "wrong-author" });
      } else {
        posts.push(result.value);
      }
    } catch {
      skipped.push({ path: record.path, reason: "unreadable" });
    }
  }
  return { posts, skipped };
}

function typedPostFromLegacy(post: SpokePost): Post | null {
  const createdAt = new Date(post.createdAt);
  if (Number.isNaN(createdAt.valueOf())) return null;

  return {
    author: post.author,
    displayName: post.displayName,
    title: post.title,
    body: post.body,
    createdAt,
    threadPath: post.threadPath ?? `/spoke/accepted/${post.id}/`,
    attachments: post.attachments?.map(toDataImageAttachment)
  };
}

async function publishMissingPosts(
  data: SpokeApp,
  posts: readonly SpokePost[],
  knownThreads: Set<string>
): Promise<LegacyPostImportResult> {
  let imported = 0;
  const skipped: SkippedLegacyPost[] = [];

  for (const post of posts) {
    const typedPost = typedPostFromLegacy(post);
    if (!typedPost) {
      skipped.push({ path: post.path, reason: "invalid-date" });
      continue;
    }
    if (typedPost.threadPath && knownThreads.has(typedPost.threadPath)) continue;

    await data.posts.create(typedPost);
    if (typedPost.threadPath) knownThreads.add(typedPost.threadPath);
    imported += 1;
  }
  return { imported, skipped };
}

export async function importLegacyPosts(
  data: SpokeApp,
  identity: string,
  reader: LegacyPostReader
): Promise<LegacyPostImportResult> {
  const subscription = await Subscription.create(data.posts.for(identity));
  const currentPosts = await subscription.get();
  const knownThreads = new Set(
    currentPosts.flatMap((item) => (item.value.threadPath ? [item.value.threadPath] : []))
  );
  const legacy = await readLegacyPosts(reader, identity);
  const published = await publishMissingPosts(data, legacy.posts, knownThreads);
  return {
    imported: published.imported,
    skipped: [...legacy.skipped, ...published.skipped]
  };
}

export function importLegacyPostsOnce(
  data: SpokeApp,
  identity: string,
  reader: LegacyPostReader,
  options: LegacyImportOptions = {}
): Promise<LegacyPostImportResult> {
  const key = normalizeIdentity(identity);
  const completionStore = options.completionStore ?? defaultCompletionStore();
  const completionKey = `${COMPLETION_KEY_PREFIX}.${key}`;
  if (completionStore?.getItem(completionKey) === "complete") {
    return Promise.resolve({ imported: 0, skipped: [] });
  }

  const active = activeImports.get(key);
  if (active) return active;

  const postImport = importLegacyPosts(data, identity, reader)
    .then((result) => {
      completionStore?.setItem(completionKey, "complete");
      return result;
    })
    .finally(() => {
      if (activeImports.get(key) === postImport) activeImports.delete(key);
    });
  activeImports.set(key, postImport);
  return postImport;
}
