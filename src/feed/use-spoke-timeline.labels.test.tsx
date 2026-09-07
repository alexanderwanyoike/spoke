// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { SubscriptionState } from "jolt-sdk/data";
import type { SpokeApp } from "../data";
import { displayNameForFeedItem } from "./model";
import type { FeedTimelineSnapshot } from "./timeline";
import { useSpokeTimeline } from "./use-spoke-timeline";

const { open } = vi.hoisted(() => ({ open: vi.fn(async () => {}) }));
vi.mock("./timeline", () => ({
  createFeedTimeline: () => ({
    open,
    subscribe: () => () => {},
    close: async () => {},
    getSnapshot: () => snapshot
  })
}));
const contact = { identity: "alex.jolt", displayName: "alex", relationship: "accepted" as const };
const snapshot: FeedTimelineSnapshot = {
  state: SubscriptionState.Ready,
  sources: [],
  items: [
    {
      source: "contact",
      contact,
      address: "alex.jolt/spoke/posts/one",
      post: {
        schema: "spoke.post.v2",
        id: "one",
        author: "alex.jolt",
        title: "",
        body: "Hi",
        path: "/spoke/posts/one",
        createdAt: "2026-09-07T00:00:00Z"
      }
    }
  ]
};
afterEach(cleanup);
it("updates visible author names without reopening feed subscriptions", async () => {
  const data = {} as SpokeApp;
  const { result, rerender } = renderHook(
    ({ contacts }) => useSpokeTimeline(data, { localIdentity: "viewer.jolt", contacts }),
    { initialProps: { contacts: [contact] } }
  );
  await waitFor(() => expect(result.current.refreshing).toBe(false));
  const initialOpens = open.mock.calls.length;
  rerender({ contacts: [{ ...contact, displayName: "Alex" }] });
  expect(displayNameForFeedItem(result.current.snapshot.items[0])).toBe("Alex");
  expect(open).toHaveBeenCalledTimes(initialOpens);
});
