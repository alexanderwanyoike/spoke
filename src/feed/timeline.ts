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
type CreatePostSubscription = (
  identity: string,
  posts: RemoteCollection<Post>,
) => Promise<PostSubscription>;

type Freshness = {
  state: SubscriptionStateValue;
  lastVerifiedAt?: number;
  reason?: SubscriptionFailureValue;
};

type FeedItemSource =
  | { source: "local" }
  | { source: "contact"; contact: FeedScope["contacts"][number] };

type SourceDescriptor = {
  identity: string;
  feedSource: FeedItemSource;
};

type TimelineSourceOptions = {
  createSubscription: CreatePostSubscription;
  streamRetryMs: number;
  streamRetryMaxMs: number;
  onChange(): void;
};

export type FeedTimelineSnapshot = Readonly<Freshness & {
  items: readonly FeedItem[];
  sources: readonly FeedTimelineSourceSnapshot[];
}>;

export type FeedTimelineSourceSnapshot = Readonly<Freshness & {
  identity: string;
}>;

export type FeedTimeline = {
  open(scope: FeedScope): Promise<void>;
  getSnapshot(): FeedTimelineSnapshot;
  subscribe(listener: () => void): () => void;
  close(): Promise<void>;
};

export type FeedTimelineOptions = {
  createSubscription?: CreatePostSubscription;
  streamRetryMs?: number;
  streamRetryMaxMs?: number;
};

function postId(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function toSpokePost(item: PresentItem<Post>): SpokePost | null {
  const value = item.value;
  if (!(value.createdAt instanceof Date) || Number.isNaN(value.createdAt.valueOf())) {
    return null;
  }

  const id = postId(item.ref.path);
  return {
    schema: value.attachments?.length ? "spoke.post.v2" : "spoke.post.v1",
    id,
    author: value.author,
    displayName: value.displayName,
    title: value.title,
    link: value.link,
    body: value.body,
    createdAt: value.createdAt.toISOString(),
    path: item.ref.path,
    threadPath: value.threadPath ?? `/spoke/accepted/${id}/`,
    attachments: value.attachments as SpokeAttachment[] | undefined,
  };
}

export function aggregateTimelineState(
  sources: readonly FeedTimelineSourceSnapshot[],
  itemCount: number,
): SubscriptionStateValue {
  if (sources.length === 0) return SubscriptionState.Ready;

  const states = new Set(sources.map((source) => source.state));
  if (states.has(SubscriptionState.Revoked)) return SubscriptionState.Revoked;
  if (states.has(SubscriptionState.Cancelled)) return SubscriptionState.Cancelled;
  if (states.has(SubscriptionState.Stale)) return SubscriptionState.Stale;
  if (states.has(SubscriptionState.Unavailable)) {
    return itemCount > 0 ? SubscriptionState.Stale : SubscriptionState.Unavailable;
  }
  if (states.has(SubscriptionState.Loading) || states.has(SubscriptionState.Updating)) {
    return SubscriptionState.Updating;
  }
  return SubscriptionState.Ready;
}

function setFreshness(source: TimelineSource, freshness: Freshness) {
  source.state = freshness.state;
  source.lastVerifiedAt = freshness.lastVerifiedAt;
  source.reason = freshness.reason;
}

function replaceItems(source: TimelineSource, items: readonly PresentItem<Post>[]) {
  source.items = new Map(items.map((item) => [item.ref.path, item]));
}

function assertNever(value: never): never {
  throw new Error(`Unhandled Data Subscription change: ${String(value)}`);
}

function applyChange(source: TimelineSource, change: DataSubscriptionChange<Post>) {
  switch (change.type) {
    case ChangeType.Snapshot:
      replaceItems(source, change.items);
      setFreshness(source, change);
      return;
    case ChangeType.Changed:
      for (const item of change.items) source.items.set(item.ref.path, item);
      for (const ref of change.removed) source.items.delete(ref.path);
      return;
    case ChangeType.State:
      setFreshness(source, change);
      return;
    case ChangeType.Cancelled:
      setFreshness(source, { state: SubscriptionState.Cancelled });
      source.items.clear();
      return;
    case ChangeType.Revoked:
      setFreshness(source, { state: SubscriptionState.Revoked });
      source.items.clear();
      return;
    case ChangeType.ResyncRequired:
      // The stream follows this marker with a complete Snapshot event.
      return;
    default:
      return assertNever(change);
  }
}

export function retryDelay(
  attempts: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  return Math.min(baseDelayMs * 2 ** Math.min(attempts, 30), maxDelayMs);
}

function sourceDescriptors(scope: FeedScope): Map<string, SourceDescriptor> {
  const descriptors = new Map<string, SourceDescriptor>();
  if (scope.localIdentity) {
    descriptors.set(normalizeIdentity(scope.localIdentity), {
      identity: scope.localIdentity,
      feedSource: { source: "local" },
    });
  }
  for (const contact of activeContacts(scope.contacts)) {
    const key = normalizeIdentity(contact.identity);
    if (!descriptors.has(key)) {
      descriptors.set(key, {
        identity: contact.identity,
        feedSource: { source: "contact", contact },
      });
    }
  }
  return descriptors;
}

function feedItemsFor(
  source: TimelineSource,
  identity: string,
  feedSource: FeedItemSource,
): FeedItem[] {
  const items: FeedItem[] = [];
  for (const item of source.items.values()) {
    const post = toSpokePost(item);
    if (!post || normalizeIdentity(post.author) !== identity) continue;
    items.push({
      ...feedSource,
      post,
      address: `${item.ref.identity}${item.ref.path}`,
    });
  }
  return items;
}

function aggregateSnapshot(
  sources: ReadonlyMap<string, TimelineSource>,
  descriptors: ReadonlyMap<string, SourceDescriptor>,
): FeedTimelineSnapshot {
  const items: FeedItem[] = [];
  const sourceSnapshots: FeedTimelineSourceSnapshot[] = [];
  for (const [identity, descriptor] of descriptors) {
    const source = sources.get(identity);
    if (!source) continue;
    items.push(...feedItemsFor(source, identity, descriptor.feedSource));
    sourceSnapshots.push(source.snapshot());
  }

  const failed = sourceSnapshots.find((source) =>
    source.state === SubscriptionState.Stale
      || source.state === SubscriptionState.Unavailable
  );
  return Object.freeze({
    items: Object.freeze(sortFeed(items)),
    state: aggregateTimelineState(sourceSnapshots, items.length),
    lastVerifiedAt: failed?.lastVerifiedAt,
    reason: failed?.reason,
    sources: Object.freeze(sourceSnapshots),
  });
}

function createPostSubscription(
  _identity: string,
  posts: RemoteCollection<Post>,
): Promise<PostSubscription> {
  return Subscription.create(posts);
}

class TimelineSource {
  items = new Map<string, PresentItem<Post>>();
  state: SubscriptionStateValue = SubscriptionState.Loading;
  lastVerifiedAt?: number;
  reason?: SubscriptionFailureValue;

  private active = true;
  private subscription?: PostSubscription;
  private subscriptionPromise?: Promise<PostSubscription>;
  private stream?: DataChangeStream<Post>;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private retryAttempts = 0;

  constructor(
    readonly identity: string,
    private readonly posts: RemoteCollection<Post>,
    private readonly options: TimelineSourceOptions,
  ) {}

  snapshot(): FeedTimelineSourceSnapshot {
    return Object.freeze({
      identity: this.identity,
      state: this.state,
      lastVerifiedAt: this.lastVerifiedAt,
      reason: this.reason,
    });
  }

  async refresh(): Promise<void> {
    try {
      const hadStream = this.stream !== undefined;
      const subscription = await this.subscriptionForSource();
      if (!subscription) return;

      const items = await subscription.get();
      if (!this.active) return;

      // A retained stream may advance while get() returns its cached view.
      // The stream owns the projection once it is running.
      if (!hadStream) replaceItems(this, items);
      setFreshness(this, subscription);
      this.retryAttempts = 0;
      this.startChanges();
    } catch {
      if (!this.active) return;
      this.markRefreshFailed();
    }
    this.options.onChange();
  }

  async stop(): Promise<void> {
    this.active = false;
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    await this.stream?.cancel().catch(() => {});
  }

  async unsubscribe(): Promise<void> {
    await this.stop();
    let subscription = this.subscription;
    if (!subscription && this.subscriptionPromise) {
      subscription = await this.subscriptionPromise.catch(() => undefined);
    }
    await subscription?.remove().catch(() => {});
  }

  private async subscriptionForSource(): Promise<PostSubscription | undefined> {
    if (this.subscription) return this.subscription;

    const pending = this.subscriptionPromise ?? this.options.createSubscription(
      this.identity,
      this.posts,
    );
    this.subscriptionPromise = pending;
    try {
      const subscription = await pending;
      if (!this.active) return undefined;
      this.subscription = subscription;
      return subscription;
    } finally {
      if (this.subscriptionPromise === pending) this.subscriptionPromise = undefined;
    }
  }

  private startChanges() {
    if (this.stream || !this.subscription) return;
    const stream = this.subscription.changes();
    this.stream = stream;
    void this.consumeChanges(stream);
  }

  private async consumeChanges(stream: DataChangeStream<Post>) {
    try {
      for await (const change of stream) {
        if (!this.active) break;
        applyChange(this, change);
        this.retryAttempts = 0;
        this.options.onChange();
      }
    } catch {
      this.handleStreamFailure();
    } finally {
      if (this.stream === stream) this.stream = undefined;
    }
  }

  private handleStreamFailure() {
    if (!this.active) return;
    this.markRefreshFailed();
    this.options.onChange();
    this.scheduleRetry();
  }

  private markRefreshFailed() {
    setFreshness(this, {
      state: this.items.size > 0
        ? SubscriptionState.Stale
        : SubscriptionState.Unavailable,
      lastVerifiedAt: this.subscription?.lastVerifiedAt ?? this.lastVerifiedAt,
      reason: this.subscription?.reason ?? this.reason,
    });
  }

  private scheduleRetry() {
    const delay = retryDelay(
      this.retryAttempts,
      this.options.streamRetryMs,
      this.options.streamRetryMaxMs,
    );
    this.retryAttempts += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      if (this.active) this.startChanges();
    }, delay);
  }
}

class SpokeFeedTimeline implements FeedTimeline {
  private readonly sources = new Map<string, TimelineSource>();
  private readonly listeners = new Set<() => void>();
  private descriptors = new Map<string, SourceDescriptor>();
  private snapshotValue: FeedTimelineSnapshot = Object.freeze({
    items: Object.freeze([]),
    state: SubscriptionState.Loading,
    sources: Object.freeze([]),
  });

  constructor(
    private readonly posts: FeedPosts,
    private readonly options: Required<FeedTimelineOptions>,
  ) {}

  async open(scope: FeedScope): Promise<void> {
    const nextDescriptors = sourceDescriptors(scope);
    const removed = [...this.sources.entries()].filter(([key]) => !nextDescriptors.has(key));
    await Promise.all(removed.map(([, source]) => source.unsubscribe()));
    for (const [key] of removed) this.sources.delete(key);

    for (const [key, descriptor] of nextDescriptors) {
      if (this.sources.has(key)) continue;
      this.sources.set(key, new TimelineSource(
        descriptor.identity,
        this.posts.for(descriptor.identity),
        {
          ...this.options,
          onChange: () => this.rebuildSnapshot(),
        },
      ));
    }

    this.descriptors = nextDescriptors;
    this.rebuildSnapshot();
    const refreshes = [...nextDescriptors.keys()].flatMap((key) => {
      const source = this.sources.get(key);
      return source ? [source.refresh()] : [];
    });
    await Promise.all(refreshes);
    this.rebuildSnapshot();
  }

  getSnapshot(): FeedTimelineSnapshot {
    return this.snapshotValue;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async close(): Promise<void> {
    const activeSources = [...this.sources.values()];
    this.sources.clear();
    this.descriptors.clear();
    await Promise.all(activeSources.map((source) => source.stop()));
    this.rebuildSnapshot();
  }

  private rebuildSnapshot() {
    this.snapshotValue = aggregateSnapshot(this.sources, this.descriptors);
    for (const listener of this.listeners) listener();
  }
}

export function createFeedTimeline(
  posts: FeedPosts,
  options: FeedTimelineOptions = {},
): FeedTimeline {
  return new SpokeFeedTimeline(posts, {
    createSubscription: options.createSubscription ?? createPostSubscription,
    streamRetryMs: options.streamRetryMs ?? 1_000,
    streamRetryMaxMs: options.streamRetryMaxMs ?? 30_000,
  });
}
