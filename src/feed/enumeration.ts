// Enumeration: discover a feed Collection through Jolt's append-record
// enumeration (J1). Each post is a coexisting append record under its author at
// /spoke/posts/{id}; listing the prefix is the Collection read. The monotonic
// store still guarantees a known post is never dropped by an incomplete list.
// This replaces the pre-J1 bridge (a Spoke-maintained /spoke/feed Singleton).

import type { EnumeratedRecord, JoltAppendSdk } from "../jolt";
import { POSTS_PREFIX } from "./model";

export type PostRef = {
  id: string;
  path: string;
  author: string;
  contentId?: string;
  latestSequence?: number;
  createdAt?: string;
};

export interface EnumerationSource {
  // List the post references published by an identity.
  listPosts(identity: string): Promise<PostRef[]>;
}

export function createJoltEnumeration(sdk: JoltAppendSdk): EnumerationSource {
  return {
    async listPosts(identity) {
      const records = await sdk.enumerate(identity, POSTS_PREFIX);
      return records.map((record) => postRefFromRecord(identity, record));
    }
  };
}

function postRefFromRecord(identity: string, record: EnumeratedRecord): PostRef {
  return {
    id: record.path.slice(POSTS_PREFIX.length),
    path: record.path,
    author: identity,
    contentId: record.contentId,
    latestSequence: record.deviceSequence,
    createdAt: record.createdAt
  };
}
