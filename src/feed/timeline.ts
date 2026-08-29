import {
  ChangeType,
  Subscription,
  SubscriptionState,
  type DataChangeStream,
  type DataSubscription,
  type DataSubscriptionChange,
  type PresentItem,
  type RemoteCollection,
  type SubscriptionFailureValue,
  type SubscriptionStateValue,
} from "jolt-sdk/data";

import type { Post, SpokeApp } from "../data";
import { activeContacts, normalizeIdentity } from "../follow";
import type { SpokeAttachment } from "../media";
import { sortFeed, type FeedItem, type SpokePost } from "./model";
import type { FeedScope } from "./queries";

export type FeedPosts = SpokeApp["posts"];
type PostSubscription = DataSubscription<Post>;

type TimelineSource = {
  identity: string;
  active: boolean;
  items: Map<string, PresentItem<Post>>;
  state: SubscriptionStateValue;
  lastVerifiedAt?: number;
  reason?: SubscriptionFailureValue;
  subscription?: PostSubscription;
  subscriptionPromise?: Promise<PostSubscription>;
  stream?: DataChangeStream<Post>;
  retryTimer?: ReturnType<typeof setTimeout>;
  retryAttempts: number;
  removeWhenReady?: boolean;
};

type FeedItemSource =
  | { source: "local" }
  | { source: "contact"; contact: FeedScope["contacts"][number] };

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
  streamRetryMs?: number;
  streamRetryMaxMs?: number;
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

function timelineStateFor(
  sources: readonly FeedTimelineSourceSnapshot[],
  hasItems: boolean,
): SubscriptionStateValue {
  if (sources.length === 0) return SubscriptionState.Ready;

  const states = new Set(sources.map((source) => source.state));
  if (states.has(SubscriptionState.Revoked)) {
    return SubscriptionState.Revoked;
  }
  if (states.has(SubscriptionState.Cancelled)) {
    return SubscriptionState.Cancelled;
  }
  if (states.has(SubscriptionState.Stale)) {
    return SubscriptionState.Stale;
  }
  if (states.has(SubscriptionState.Unavailable)) {
    return hasItems ? SubscriptionState.Stale : SubscriptionState.Unavailable;
  }
  if (states.has(SubscriptionState.Loading) || states.has(SubscriptionState.Updating)) {
    return SubscriptionState.Updating;
  }

  return SubscriptionState.Ready;
}

function replaceItems(source: TimelineSource, items: readonly PresentItem<Post>[]) {
  source.items = new Map(items.map((item) => [item.ref.path, item]));
}

function applyChange(source: TimelineSource, change: DataSubscriptionChange<Post>) {
  switch (change.type) {
    case ChangeType.Snapshot:
      replaceItems(source, change.items);
      source.state = change.state;
      source.lastVerifiedAt = change.lastVerifiedAt;
      source.reason = change.reason;
      return;

    case ChangeType.Changed:
      for (const item of change.items) source.items.set(item.ref.path, item);
      for (const ref of change.removed) source.items.delete(ref.path);
      return;

    case ChangeType.State:
      source.state = change.state;
      source.lastVerifiedAt = change.lastVerifiedAt;
      source.reason = change.reason;
      return;

    case ChangeType.Cancelled:
      source.state = SubscriptionState.Cancelled;
      source.items.clear();
      return;

    case ChangeType.Revoked:
      source.state = SubscriptionState.Revoked;
      source.items.clear();
      return;

    case ChangeType.ResyncRequired:
      // The stream follows this marker with a complete Snapshot event.
      return;
  }
}

function markRefreshFailed(source: TimelineSource) {
  source.state = source.items.size > 0
    ? SubscriptionState.Stale
    : SubscriptionState.Unavailable;
}

function feedSourcesFor(scope: FeedScope): Map<string, FeedItemSource> {
  const sources = new Map<string, FeedItemSource>();
  if (scope.localIdentity) {
    sources.set(normalizeIdentity(scope.localIdentity), { source: "local" });
  }
  for (const contact of activeContacts(scope.contacts)) {
    const identity = normalizeIdentity(contact.identity);
    if (!sources.has(identity)) {
      sources.set(identity, { source: "contact", contact });
    }
  }
  return sources;
}

function sourceSnapshotFor(source: TimelineSource): FeedTimelineSourceSnapshot {
  return Object.freeze({
    identity: source.identity,
    state: source.state,
    lastVerifiedAt: source.lastVerifiedAt,
    reason: source.reason,
  });
}

function feedItemsFor(
  source: TimelineSource,
  identity: string,
  feedSource: FeedItemSource,
): FeedItem[] {
  const items: FeedItem[] = [];
  for (const item of source.items.values()) {
    let post: SpokePost;
    try {
      post = toSpokePost(item);
    } catch {
      continue;
    }
    if (normalizeIdentity(post.author) !== identity) continue;
    items.push({
      ...feedSource,
      post,
      address: `${item.ref.identity}${item.ref.path}`,
    });
  }
  return items;
}

function createPostSubscription(
  _identity: string,
  posts: RemoteCollection<Post>,
): Promise<PostSubscription> {
  return Subscription.create(posts);
}

export function createFeedTimeline(
  posts: FeedPosts,
  options: FeedTimelineOptions = {},
): FeedTimeline {
  const createSubscription = options.createSubscription ?? createPostSubscription;
  const streamRetryMs = options.streamRetryMs ?? 1_000;
  const streamRetryMaxMs = options.streamRetryMaxMs ?? 30_000;

  const sources = new Map<string, TimelineSource>();
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
    const feedSources = feedSourcesFor(currentScope);
    const items: FeedItem[] = [];
    const sourceSnapshots: FeedTimelineSourceSnapshot[] = [];
    for (const identity of sourceOrder) {
      const source = sources.get(identity);
      if (!source) continue;

      const feedSource = feedSources.get(identity);
      if (feedSource) items.push(...feedItemsFor(source, identity, feedSource));
      sourceSnapshots.push(sourceSnapshotFor(source));
    }

    const failed = sourceSnapshots.find((source) =>
      source.state === SubscriptionState.Stale
        || source.state === SubscriptionState.Unavailable
    );
    snapshot = Object.freeze({
      items: Object.freeze(sortFeed(items)),
      state: timelineStateFor(sourceSnapshots, items.length > 0),
      lastVerifiedAt: failed?.lastVerifiedAt,
      reason: failed?.reason,
      sources: Object.freeze(sourceSnapshots),
    });
    for (const listener of listeners) listener();
  }

  function scheduleStreamRetry(source: TimelineSource) {
    const delay = Math.min(
      streamRetryMs * 2 ** Math.min(source.retryAttempts, 30),
      streamRetryMaxMs,
    );
    source.retryAttempts += 1;
    source.retryTimer = setTimeout(() => {
      source.retryTimer = undefined;
      if (source.active) startChanges(source);
    }, delay);
  }

  async function consumeChanges(
    source: TimelineSource,
    stream: DataChangeStream<Post>,
  ) {
    let shouldRetry = false;
    try {
      for await (const change of stream) {
        if (!source.active) break;
        applyChange(source, change);
        source.retryAttempts = 0;
        rebuildSnapshot();
      }
    } catch {
      if (source.active) {
        shouldRetry = true;
        markRefreshFailed(source);
        rebuildSnapshot();
      }
    } finally {
      if (source.stream === stream) source.stream = undefined;
      if (shouldRetry && source.active) scheduleStreamRetry(source);
    }
  }

  function startChanges(source: TimelineSource) {
    if (source.stream) return;
    const subscription = source.subscription;
    if (!subscription || typeof subscription.changes !== "function") return;

    const stream = subscription.changes();
    source.stream = stream;
    void consumeChanges(source, stream);
  }

  async function subscriptionFor(
    source: TimelineSource,
  ): Promise<PostSubscription | undefined> {
    if (source.subscription) return source.subscription;

    const pending = source.subscriptionPromise ?? createSubscription(
      source.identity,
      posts.for(normalizeIdentity(source.identity)),
    );
    source.subscriptionPromise = pending;

    let subscription: PostSubscription;
    try {
      subscription = await pending;
    } finally {
      if (source.subscriptionPromise === pending) {
        source.subscriptionPromise = undefined;
      }
    }

    if (!source.active) {
      if (source.removeWhenReady) await subscription.remove().catch(() => {});
      return undefined;
    }

    source.subscription ??= subscription;
    return source.subscription;
  }

  async function refreshSource(source: TimelineSource) {
    try {
      const hadStream = source.stream !== undefined;
      const subscription = await subscriptionFor(source);
      if (!subscription) return;

      const items = await subscription.get();
      if (!source.active) return;
      // A retained Change Stream may advance while get() returns its cached
      // view. Keep the stream's projection in that case; get() still triggers
      // the bounded refresh and the stream delivers the resulting delta.
      if (!hadStream) replaceItems(source, items);
      source.state = subscription.state;
      source.lastVerifiedAt = subscription.lastVerifiedAt;
      source.reason = subscription.reason;
      source.retryAttempts = 0;
      startChanges(source);
    } catch {
      if (!source.active) return;
      markRefreshFailed(source);
      source.lastVerifiedAt = source.subscription?.lastVerifiedAt;
      source.reason = source.subscription?.reason;
    }
  }

  async function removeSource(source: TimelineSource, removeSubscription: boolean) {
    source.active = false;
    source.removeWhenReady = removeSubscription;
    if (source.retryTimer !== undefined) clearTimeout(source.retryTimer);
    await source.stream?.cancel().catch(() => {});
    if (removeSubscription) await source.subscription?.remove().catch(() => {});
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
      await Promise.all(removed.map(([, source]) => removeSource(source, true)));
      for (const [key] of removed) sources.delete(key);

      for (const [key, identity] of desired) {
        if (!sources.has(key)) {
          sources.set(key, {
            identity,
            active: true,
            items: new Map(),
            state: SubscriptionState.Loading,
            retryAttempts: 0,
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
      await Promise.all(active.map((source) => removeSource(source, false)));
      rebuildSnapshot();
    },
  };
}
