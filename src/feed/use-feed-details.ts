import { useEffect, useRef } from "react";

import { activeContacts, normalizeIdentity } from "../follow";
import type { JoltSdk } from "../jolt";
import { loadProfile } from "../profile";
import { loadThread, type ThreadEnumeration } from "../thread";
import type { Contact, FeedItem } from "./model";

type ThreadDetails = {
  author: string;
  postId: string;
};

type FeedDetailsScope = {
  identities: readonly string[];
  threads: readonly ThreadDetails[];
};

type FeedDetailsOptions = {
  enabled: boolean;
  localIdentity: string;
  contacts: Contact[];
  items: readonly FeedItem[];
  jolt: JoltSdk;
  threadEnumeration: ThreadEnumeration;
};

function feedDetailsScope(options: FeedDetailsOptions): FeedDetailsScope {
  const contactIdentities = activeContacts(options.contacts).map((contact) =>
    normalizeIdentity(contact.identity)
  );
  return {
    identities: [normalizeIdentity(options.localIdentity), ...contactIdentities].filter(Boolean),
    threads: options.items.map((item) => ({
      author: item.post.author,
      postId: item.post.id
    }))
  };
}

function sameFeedDetails(left: FeedDetailsScope, right: FeedDetailsScope): boolean {
  if (left.identities.length !== right.identities.length) return false;
  if (left.threads.length !== right.threads.length) return false;
  if (left.identities.some((identity, index) => identity !== right.identities[index])) return false;
  return left.threads.every((thread, index) => {
    const other = right.threads[index];
    return thread.author === other?.author && thread.postId === other?.postId;
  });
}

function useStableFeedDetails(options: FeedDetailsOptions): FeedDetailsScope {
  const next = feedDetailsScope(options);
  const stable = useRef(next);
  if (!sameFeedDetails(stable.current, next)) stable.current = next;
  return stable.current;
}

async function loadFeedDetails(
  scope: FeedDetailsScope,
  jolt: JoltSdk,
  threadEnumeration: ThreadEnumeration
) {
  await Promise.all(
    scope.identities.map((identity) => loadProfile(jolt, identity).catch(() => null))
  );
  await Promise.all(
    scope.threads.map((thread) =>
      loadThread(jolt, threadEnumeration, thread.author, thread.postId).catch(() => {})
    )
  );
}

export function useFeedDetails(options: FeedDetailsOptions) {
  const scope = useStableFeedDetails(options);
  useEffect(() => {
    if (!options.enabled) return;
    void loadFeedDetails(scope, options.jolt, options.threadEnumeration);
  }, [options.enabled, options.jolt, options.threadEnumeration, scope]);
}
