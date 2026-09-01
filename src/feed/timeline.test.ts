import { describe, expect, it, vi } from "vitest";
import {
  ChangeType,
  State,
  SubscriptionFailure,
  SubscriptionState,
  type DataChangeStream,
  type DataSubscription,
  type PresentItem,
} from "jolt-sdk/data";

import { SpokeData, type Post } from "../data";
import type { Contact } from "./model";
import {
  aggregateTimelineState,
  createFeedTimeline,
  retryDelay,
  type FeedTimelineSourceSnapshot,
} from "./timeline";

function contact(identity: string, displayName: string): Contact {
  return { identity, displayName, relationship: "accepted" };
}

function idleChanges(): DataChangeStream<Post> {
  return {
    async *[Symbol.asyncIterator]() {},
    async cancel() {},
  };
}

function sourceState(
  state: FeedTimelineSourceSnapshot["state"],
): FeedTimelineSourceSnapshot {
  return { identity: "source.jolt", state };
}

describe("feed timeline", () => {
  it("aggregates source freshness in explicit priority order", () => {
    expect(aggregateTimelineState([], 0)).toBe(SubscriptionState.Ready);
    expect(aggregateTimelineState([
      sourceState(SubscriptionState.Ready),
      sourceState(SubscriptionState.Loading),
    ], 0)).toBe(SubscriptionState.Updating);
    expect(aggregateTimelineState([
      sourceState(SubscriptionState.Unavailable),
    ], 0)).toBe(SubscriptionState.Unavailable);
    expect(aggregateTimelineState([
      sourceState(SubscriptionState.Unavailable),
    ], 1)).toBe(SubscriptionState.Stale);
    expect(aggregateTimelineState([
      sourceState(SubscriptionState.Stale),
      sourceState(SubscriptionState.Cancelled),
    ], 1)).toBe(SubscriptionState.Cancelled);
    expect(aggregateTimelineState([
      sourceState(SubscriptionState.Cancelled),
      sourceState(SubscriptionState.Revoked),
    ], 1)).toBe(SubscriptionState.Revoked);
  });

  it("calculates capped exponential retry delays", () => {
    expect([0, 1, 2, 3].map((attempt) => retryDelay(attempt, 10, 40))).toEqual([
      10,
      20,
      40,
      40,
    ]);
  });

  it("opens from typed Materialized Views and preserves Spoke's feed ordering", async () => {
    const world = SpokeData.testWorld();
    const alice = world.as("alice");
    const bob = world.as("bob");
    const viewer = world.as("viewer");

    await alice.posts.create({
      author: "alice.jolt",
      displayName: "Alice",
      title: "Older",
      body: "Alice's post",
      createdAt: new Date("2026-08-29T09:00:00.000Z"),
    });
    await bob.posts.create({
      author: "bob.jolt",
      displayName: "Bob",
      title: "Newer",
      body: "Bob's post",
      createdAt: new Date("2026-08-29T10:00:00.000Z"),
    });

    const timeline = createFeedTimeline(viewer.posts);
    await timeline.open({
      localIdentity: "viewer.jolt",
      contacts: [contact("alice.jolt", "Alice"), contact("bob.jolt", "Bob")],
    });

    const view = timeline.getSnapshot();
    expect(view.state).toBe(SubscriptionState.Ready);
    expect(view.items.map((item) => item.post.title)).toEqual(["Newer", "Older"]);
    expect(view.items.map((item) => item.source)).toEqual(["contact", "contact"]);
    expect(view.items[0]?.address).toMatch(/^bob\/spoke\/posts\//);

    await timeline.close();
  });

  it("renders the Last Verified View immediately when its source is offline", async () => {
    const viewer = SpokeData.test({ identity: "viewer.jolt" });
    const cached = {
      state: State.Present,
      ref: { identity: "alice.jolt", path: "/spoke/posts/cached" },
      value: {
        author: "alice.jolt",
        title: "Still visible",
        body: "Cached before Alice went offline",
        createdAt: new Date("2026-08-29T09:00:00.000Z"),
      },
      isPresent: () => true,
      isDeleted: () => false,
      isConflicted: () => false,
    } as unknown as PresentItem<Post>;
    const subscription = {
      id: "sub_alice",
      identity: "alice.jolt",
      state: SubscriptionState.Stale,
      lastVerifiedAt: 1_788_000_000,
      reason: SubscriptionFailure.NetworkUnavailable,
      get: async () => [cached],
      changes: idleChanges,
      remove: async () => {},
    } as unknown as DataSubscription<Post>;
    const timeline = createFeedTimeline(viewer.posts, {
      createSubscription: async () => subscription,
    });

    await timeline.open({
      localIdentity: "",
      contacts: [contact("alice.jolt", "Alice")],
    });

    expect(timeline.getSnapshot()).toMatchObject({
      state: SubscriptionState.Stale,
      reason: SubscriptionFailure.NetworkUnavailable,
      lastVerifiedAt: 1_788_000_000,
    });
    expect(timeline.getSnapshot().items.map((item) => item.post.title)).toEqual([
      "Still visible",
    ]);
  });

  it("keeps healthy followed content visible when another identity is unavailable", async () => {
    const viewer = SpokeData.test({ identity: "viewer.jolt" });
    const alicePost = {
      state: State.Present,
      ref: { identity: "alice.jolt", path: "/spoke/posts/healthy" },
      value: {
        author: "alice.jolt",
        title: "Alice is here",
        body: "A verified post",
        createdAt: new Date("2026-08-29T09:00:00.000Z"),
      },
    } as unknown as PresentItem<Post>;
    const alice = {
      id: "sub_alice",
      identity: "alice.jolt",
      state: SubscriptionState.Ready,
      get: async () => [alicePost],
      changes: idleChanges,
      remove: async () => {},
    } as unknown as DataSubscription<Post>;
    const bob = {
      id: "sub_bob",
      identity: "bob.jolt",
      state: SubscriptionState.Unavailable,
      reason: SubscriptionFailure.NetworkUnavailable,
      get: async () => {
        throw new Error("Bob is offline");
      },
      changes: idleChanges,
      remove: async () => {},
    } as unknown as DataSubscription<Post>;
    const timeline = createFeedTimeline(viewer.posts, {
      createSubscription: async (identity) => identity === "alice.jolt" ? alice : bob,
    });

    await expect(timeline.open({
      localIdentity: "",
      contacts: [contact("alice.jolt", "Alice"), contact("bob.jolt", "Bob")],
    })).resolves.toBeUndefined();

    const view = timeline.getSnapshot();
    expect(view.items.map((item) => item.post.title)).toEqual(["Alice is here"]);
    expect(view.state).toBe(SubscriptionState.Stale);
    expect(view.sources).toEqual([
      { identity: "alice.jolt", state: SubscriptionState.Ready },
      {
        identity: "bob.jolt",
        state: SubscriptionState.Unavailable,
        reason: SubscriptionFailure.NetworkUnavailable,
      },
    ]);
  });

  it("inserts a newly verified post from the local Change Stream", async () => {
    const world = SpokeData.testWorld();
    const alice = world.as("alice");
    const viewer = world.as("viewer");
    await alice.posts.create({
      author: "alice.jolt",
      title: "First",
      body: "Already cached",
      createdAt: new Date("2026-08-29T09:00:00.000Z"),
    });
    const timeline = createFeedTimeline(viewer.posts);
    await timeline.open({
      localIdentity: "",
      contacts: [contact("alice.jolt", "Alice")],
    });
    const changed = vi.fn();
    const unsubscribe = timeline.subscribe(changed);

    await alice.posts.create({
      author: "alice.jolt",
      title: "Second",
      body: "Arrived as a delta",
      createdAt: new Date("2026-08-29T10:00:00.000Z"),
    });

    await vi.waitFor(() => {
      expect(timeline.getSnapshot().items.map((item) => item.post.title)).toEqual([
        "Second",
        "First",
      ]);
    });
    expect(changed).toHaveBeenCalled();

    unsubscribe();
    await timeline.close();
  });

  it("retains subscriptions on warm open and removes only an unfollowed identity", async () => {
    const viewer = SpokeData.test({ identity: "viewer.jolt" });
    const removed: string[] = [];
    const created: string[] = [];
    const timeline = createFeedTimeline(viewer.posts, {
      createSubscription: async (identity) => {
        created.push(identity);
        return {
          id: `sub_${identity}`,
          identity,
          state: SubscriptionState.Ready,
          get: async () => [],
          changes: idleChanges,
          remove: async () => {
            removed.push(identity);
          },
        } as unknown as DataSubscription<Post>;
      },
    });
    const alice = contact("alice.jolt", "Alice");
    const bob = contact("bob.jolt", "Bob");

    await timeline.open({ localIdentity: "", contacts: [alice, bob] });
    await timeline.open({ localIdentity: "", contacts: [alice, bob] });
    expect(created).toEqual(["alice.jolt", "bob.jolt"]);
    expect(removed).toEqual([]);

    await timeline.open({ localIdentity: "", contacts: [alice] });
    expect(created).toEqual(["alice.jolt", "bob.jolt"]);
    expect(removed).toEqual(["bob.jolt"]);
    expect(timeline.getSnapshot().sources.map((source) => source.identity)).toEqual([
      "alice.jolt",
    ]);

    await timeline.close();
  });

  it("isolates one malformed projected record from healthy posts by the same identity", async () => {
    const viewer = SpokeData.test({ identity: "viewer.jolt" });
    const healthy = {
      state: State.Present,
      ref: { identity: "alice.jolt", path: "/spoke/posts/healthy" },
      value: {
        author: "alice.jolt",
        title: "Healthy",
        body: "Still rendered",
        createdAt: new Date("2026-08-29T09:00:00.000Z"),
      },
    } as unknown as PresentItem<Post>;
    const malformed = {
      state: State.Present,
      ref: { identity: "alice.jolt", path: "/spoke/posts/malformed" },
      value: {
        author: "alice.jolt",
        title: "Malformed",
        body: "Historical invalid date",
        createdAt: "not-a-date",
      },
    } as unknown as PresentItem<Post>;
    const subscription = {
      id: "sub_alice",
      identity: "alice.jolt",
      state: SubscriptionState.Ready,
      get: async () => [malformed, healthy],
      changes: idleChanges,
      remove: async () => {},
    } as unknown as DataSubscription<Post>;
    const timeline = createFeedTimeline(viewer.posts, {
      createSubscription: async () => subscription,
    });

    await expect(timeline.open({
      localIdentity: "",
      contacts: [contact("alice.jolt", "Alice")],
    })).resolves.toBeUndefined();
    expect(timeline.getSnapshot().items.map((item) => item.post.title)).toEqual([
      "Healthy",
    ]);
    expect(timeline.getSnapshot().state).toBe(SubscriptionState.Ready);
  });

  it("coalesces concurrent Home opens into one subscription per identity", async () => {
    const viewer = SpokeData.test({ identity: "viewer.jolt" });
    let release!: () => void;
    const admitted = new Promise<void>((resolve) => {
      release = resolve;
    });
    const created = vi.fn(async (identity: string) => {
      await admitted;
      return {
        id: `sub_${identity}`,
        identity,
        state: SubscriptionState.Ready,
        get: async () => [],
        changes: idleChanges,
        remove: async () => {},
      } as unknown as DataSubscription<Post>;
    });
    const timeline = createFeedTimeline(viewer.posts, { createSubscription: created });
    const scope = { localIdentity: "", contacts: [contact("alice.jolt", "Alice")] };

    const first = timeline.open(scope);
    const second = timeline.open(scope);
    release();
    await Promise.all([first, second]);

    expect(created).toHaveBeenCalledTimes(1);
    await timeline.close();
  });

  it("closes local streams without deleting durable subscriptions", async () => {
    const viewer = SpokeData.test({ identity: "viewer.jolt" });
    const remove = vi.fn(async () => {});
    const timeline = createFeedTimeline(viewer.posts, {
      createSubscription: async (identity) => ({
        id: `sub_${identity}`,
        identity,
        state: SubscriptionState.Ready,
        get: async () => [],
        changes: idleChanges,
        remove,
      }) as unknown as DataSubscription<Post>,
    });

    await timeline.open({
      localIdentity: "",
      contacts: [contact("alice.jolt", "Alice")],
    });
    await timeline.close();

    expect(remove).not.toHaveBeenCalled();
  });

  it("clears cached posts and surfaces a revoked subscription", async () => {
    const viewer = SpokeData.test({ identity: "viewer.jolt" });
    const cached = {
      state: State.Present,
      ref: { identity: "alice.jolt", path: "/spoke/posts/cached" },
      value: {
        author: "alice.jolt",
        title: "No longer authorized",
        body: "Must disappear after revocation",
        createdAt: new Date("2026-08-29T09:00:00.000Z"),
      },
    } as unknown as PresentItem<Post>;
    const subscription = {
      id: "sub_alice",
      identity: "alice.jolt",
      state: SubscriptionState.Ready,
      get: async () => [cached],
      changes: () => ({
        async *[Symbol.asyncIterator]() {
          yield { type: ChangeType.Revoked };
        },
        cancel: async () => {},
      }),
      remove: async () => {},
    } as unknown as DataSubscription<Post>;
    const timeline = createFeedTimeline(viewer.posts, {
      createSubscription: async () => subscription,
    });

    await timeline.open({
      localIdentity: "",
      contacts: [contact("alice.jolt", "Alice")],
    });
    await vi.waitFor(() => {
      expect(timeline.getSnapshot().state).toBe(SubscriptionState.Revoked);
    });
    expect(timeline.getSnapshot().items).toEqual([]);

    await timeline.close();
  });

  it("reopens a Change Stream after a transient iterator failure", async () => {
    const viewer = SpokeData.test({ identity: "viewer.jolt" });
    const recovered = {
      state: State.Present,
      ref: { identity: "alice.jolt", path: "/spoke/posts/recovered" },
      value: {
        author: "alice.jolt",
        title: "Recovered",
        body: "Delivered after retry",
        createdAt: new Date("2026-08-29T09:00:00.000Z"),
      },
    } as unknown as PresentItem<Post>;
    let attempts = 0;
    const subscription = {
      id: "sub_alice",
      identity: "alice.jolt",
      state: SubscriptionState.Ready,
      get: async () => [],
      changes: () => {
        attempts += 1;
        return {
          async *[Symbol.asyncIterator]() {
            if (attempts === 1) throw new Error("transport interrupted");
            yield {
              type: ChangeType.Changed,
              cursor: "cursor_2",
              items: [recovered],
              removed: [],
            };
          },
          cancel: async () => {},
        };
      },
      remove: async () => {},
    } as unknown as DataSubscription<Post>;
    const timeline = createFeedTimeline(viewer.posts, {
      createSubscription: async () => subscription,
      streamRetryMs: 0,
    });

    await timeline.open({
      localIdentity: "",
      contacts: [contact("alice.jolt", "Alice")],
    });
    await vi.waitFor(() => {
      expect(timeline.getSnapshot().items.map((item) => item.post.title)).toEqual([
        "Recovered",
      ]);
    });
    expect(attempts).toBe(2);

    await timeline.close();
  });

  it("backs repeated Change Stream failures off to a ceiling", async () => {
    vi.useFakeTimers();
    try {
      const viewer = SpokeData.test({ identity: "viewer.jolt" });
      let attempts = 0;
      const subscription = {
        id: "sub_alice",
        identity: "alice.jolt",
        state: SubscriptionState.Ready,
        get: async () => [],
        changes: () => {
          attempts += 1;
          return {
            async *[Symbol.asyncIterator]() {
              throw new Error("still offline");
            },
            cancel: async () => {},
          };
        },
        remove: async () => {},
      } as unknown as DataSubscription<Post>;
      const timeline = createFeedTimeline(viewer.posts, {
        createSubscription: async () => subscription,
        streamRetryMs: 10,
        streamRetryMaxMs: 40,
      });

      await timeline.open({
        localIdentity: "",
        contacts: [contact("alice.jolt", "Alice")],
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(attempts).toBe(1);

      await vi.advanceTimersByTimeAsync(10);
      expect(attempts).toBe(2);
      await vi.advanceTimersByTimeAsync(20);
      expect(attempts).toBe(3);
      await vi.advanceTimersByTimeAsync(40);
      expect(attempts).toBe(4);

      await timeline.close();
    } finally {
      vi.useRealTimers();
    }
  });
});
