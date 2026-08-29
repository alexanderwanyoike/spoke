import {
  ChangeType,
  Subscription,
  SubscriptionState,
  type DataChangeStream,
  type DataSubscription,
  type PresentItem,
  type RemoteCollection,
  type SubscriptionFailureValue,
  type SubscriptionStateValue,
} from "jolt-sdk/data";

import { SpokeData, type Post } from "../data";
import { activeContacts, normalizeIdentity } from "../follow";
import type { SpokeAttachment } from "../media";
import { sortFeed, type FeedItem, type SpokePost } from "./model";
import type { FeedScope } from "./queries";

type PostsResource = ReturnType<typeof SpokeData.test>["posts"];
type PostSubscription = DataSubscription<Post>;

export type FeedTimelineSnapshot = {
  readonly items: readonly FeedItem[];
  readonly state: SubscriptionStateValue;
  readonly lastVerifiedAt?: number;
  readonly reason?: SubscriptionFailureValue;
  readonly sources: readonly FeedTimelineSourceSnapshot[];
};

export type FeedTimelineSourceSnapshot = {
  readonly identity: string;
  readonly state: SubscriptionStateValue;
  readonly lastVerifiedAt?: number;
  readonly reason?: SubscriptionFailureValue;
};

export type FeedTimeline = {
  open(scope: FeedScope): Promise<void>;
  getSnapshot(): FeedTimelineSnapshot;
  subscribe(listener: () => void): () => void;
  close(): Promise<void>;
};

export type FeedTimelineOptions = {
  createSubscription?: (
    identity: string,
    posts: RemoteCollection<Post>,
  ) => Promise<PostSubscription>;
};

function postId(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function toSpokePost(item: PresentItem<Post>): SpokePost {
  const value = item.value;
  const id = postId(item.ref.path);
  return {
    schema: value.attachments?.length ? "spoke.post.v2" : "spoke.post.v1",
    id,
    author: value.author,
    displayName: value.displayName,
    title: value.title,
    body: value.body,
    createdAt: value.createdAt.toISOString(),
    path: item.ref.path,
    threadPath: value.threadPath ?? `/spoke/accepted/${id}/`,
    attachments: value.attachments as SpokeAttachment[] | undefined,
  };
}

export function createFeedTimeline(
  posts: PostsResource,
  options: FeedTimelineOptions = {},
): FeedTimeline {
  const createSubscription = options.createSubscription
    ?? ((_identity: string, remotePosts: RemoteCollection<Post>) => Subscription.create(remotePosts));
  type Source = {
    identity: string;
    active: boolean;
    items: Map<string, PresentItem<Post>>;
    state: SubscriptionStateValue;
    lastVerifiedAt?: number;
    reason?: SubscriptionFailureValue;
    subscription?: PostSubscription;
    stream?: DataChangeStream<Post>;
  };

  const sources = new Map<string, Source>();
  const listeners = new Set<() => void>();
  let currentScope: FeedScope = { localIdentity: "", contacts: [] };
  let sourceOrder: string[] = [];
  let snapshot: FeedTimelineSnapshot = Object.freeze({
    items: Object.freeze([]),
    state: SubscriptionState.Loading,
    sources: Object.freeze([]),
  });

  function sourceDescriptors(scope: FeedScope) {
    const descriptors = new Map<string, string>();
    if (scope.localIdentity) {
      descriptors.set(normalizeIdentity(scope.localIdentity), scope.localIdentity);
    }
    for (const contact of activeContacts(scope.contacts)) {
      const key = normalizeIdentity(contact.identity);
      if (!descriptors.has(key)) descriptors.set(key, contact.identity);
    }
    return descriptors;
  }

  function rebuildSnapshot() {
    const feedSources = new Map<
      string,
      { source: "local" } | { source: "contact"; contact: FeedScope["contacts"][number] }
    >();
    if (currentScope.localIdentity) {
      feedSources.set(normalizeIdentity(currentScope.localIdentity), { source: "local" });
    }
    for (const contact of activeContacts(currentScope.contacts)) {
      const key = normalizeIdentity(contact.identity);
      if (!feedSources.has(key)) {
        feedSources.set(key, { source: "contact", contact });
      }
    }

    const items: FeedItem[] = [];
    const sourceSnapshots = sourceOrder.flatMap((key) => {
      const source = sources.get(key);
      if (!source) return [];
      const feedSource = feedSources.get(key);
      if (feedSource) {
        for (const item of source.items.values()) {
          let post: SpokePost;
          try {
            post = toSpokePost(item);
          } catch {
            continue;
          }
          if (normalizeIdentity(post.author) !== key) continue;
          items.push({
            ...feedSource,
            post,
            address: `${item.ref.identity}${item.ref.path}`,
          });
        }
      }
      return [Object.freeze({
        identity: source.identity,
        state: source.state,
        lastVerifiedAt: source.lastVerifiedAt,
        reason: source.reason,
      })];
    });
    const stale = sourceSnapshots.find((source) => source.state === SubscriptionState.Stale);
    const unavailable = sourceSnapshots.find(
      (source) => source.state === SubscriptionState.Unavailable,
    );
    const pending = sourceSnapshots.some(
      (source) => source.state === SubscriptionState.Loading
        || source.state === SubscriptionState.Updating,
    );
    const state = sourceSnapshots.length === 0
      ? SubscriptionState.Ready
      : stale
        ? SubscriptionState.Stale
        : unavailable && items.length === 0
          ? SubscriptionState.Unavailable
          : unavailable
            ? SubscriptionState.Stale
            : pending
              ? SubscriptionState.Updating
              : SubscriptionState.Ready;
    const failed = stale ?? unavailable;
    snapshot = Object.freeze({
      items: Object.freeze(sortFeed(items)),
      state,
      lastVerifiedAt: failed?.lastVerifiedAt,
      reason: failed?.reason,
      sources: Object.freeze(sourceSnapshots),
    });
    for (const listener of listeners) listener();
  }

  function replaceItems(source: Source, items: readonly PresentItem<Post>[]) {
    source.items = new Map(items.map((item) => [item.ref.path, item]));
  }

  function startChanges(source: Source) {
    if (source.stream || !source.subscription
      || typeof source.subscription.changes !== "function") return;
    const stream = source.subscription.changes();
    source.stream = stream;
    void (async () => {
      try {
        for await (const change of stream) {
          if (!source.active) break;
          if (change.type === ChangeType.Snapshot) {
            replaceItems(source, change.items);
            source.state = change.state;
            source.lastVerifiedAt = change.lastVerifiedAt;
            source.reason = change.reason;
          } else if (change.type === ChangeType.Changed) {
            for (const item of change.items) source.items.set(item.ref.path, item);
            for (const ref of change.removed) source.items.delete(ref.path);
          } else if (change.type === ChangeType.State) {
            source.state = change.state;
            source.lastVerifiedAt = change.lastVerifiedAt;
            source.reason = change.reason;
          } else if (change.type === ChangeType.Cancelled) {
            source.state = SubscriptionState.Cancelled;
          } else if (change.type === ChangeType.Revoked) {
            source.state = SubscriptionState.Revoked;
          }
          rebuildSnapshot();
        }
      } catch {
        if (source.active) {
          source.state = source.items.size > 0
            ? SubscriptionState.Stale
            : SubscriptionState.Unavailable;
          rebuildSnapshot();
        }
      } finally {
        if (source.stream === stream) source.stream = undefined;
      }
    })();
  }

  async function refreshSource(source: Source) {
    try {
      const hadStream = source.stream !== undefined;
      source.subscription ??= await createSubscription(
        source.identity,
        posts.for(source.identity),
      );
      const items = await source.subscription.get();
      if (!source.active) return;
      // A retained Change Stream may advance while get() returns its cached
      // view. Keep the stream's projection in that case; get() still triggers
      // the bounded refresh and the stream delivers the resulting delta.
      if (!hadStream) replaceItems(source, items);
      source.state = source.subscription.state;
      source.lastVerifiedAt = source.subscription.lastVerifiedAt;
      source.reason = source.subscription.reason;
      startChanges(source);
    } catch {
      if (!source.active) return;
      source.state = source.items.size > 0
        ? SubscriptionState.Stale
        : SubscriptionState.Unavailable;
      source.lastVerifiedAt = source.subscription?.lastVerifiedAt;
      source.reason = source.subscription?.reason;
    }
  }

  async function removeSource(source: Source) {
    source.active = false;
    await source.stream?.cancel().catch(() => {});
    await source.subscription?.remove().catch(() => {});
  }

  return {
    async open(scope) {
      currentScope = {
        localIdentity: scope.localIdentity,
        contacts: activeContacts(scope.contacts),
      };
      const desired = sourceDescriptors(currentScope);
      const removed = [...sources.entries()]
        .filter(([key]) => !desired.has(key));
      await Promise.all(removed.map(([, source]) => removeSource(source)));
      for (const [key] of removed) sources.delete(key);

      for (const [key, identity] of desired) {
        if (!sources.has(key)) {
          sources.set(key, {
            identity,
            active: true,
            items: new Map(),
            state: SubscriptionState.Loading,
          });
        }
      }
      sourceOrder = [...desired.keys()];
      rebuildSnapshot();
      await Promise.all(sourceOrder.map((key) => refreshSource(sources.get(key)!)));
      rebuildSnapshot();
    },
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async close() {
      const active = [...sources.values()];
      sources.clear();
      sourceOrder = [];
      await Promise.all(active.map(removeSource));
      rebuildSnapshot();
    },
  };
}
