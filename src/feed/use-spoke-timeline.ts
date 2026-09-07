import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { SubscriptionState } from "jolt-sdk/data";

import type { SpokeApp } from "../data";
import { activeContacts, normalizeIdentity } from "../follow";
import { createFeedTimeline, type FeedTimelineSnapshot } from "./timeline";
import type { FeedScope } from "./queries";

const EMPTY_TIMELINE: FeedTimelineSnapshot = Object.freeze({
  items: Object.freeze([]),
  state: SubscriptionState.Loading,
  sources: Object.freeze([])
});

export type SpokeTimeline = {
  snapshot: FeedTimelineSnapshot;
  refreshing: boolean;
  error: unknown;
  refresh(): Promise<FeedTimelineSnapshot>;
};

export function feedScopeKey(scope: FeedScope): string {
  const contacts = [
    ...new Set(activeContacts(scope.contacts).map((contact) => normalizeIdentity(contact.identity)))
  ].sort();
  return JSON.stringify([normalizeIdentity(scope.localIdentity), contacts]);
}

export function useSpokeTimeline(data: SpokeApp | null, scope: FeedScope): SpokeTimeline {
  const timeline = useMemo(() => {
    if (!data) return null;
    return createFeedTimeline(data.posts);
  }, [data]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const scopeKey = feedScopeKey(scope);

  const subscribe = useCallback(
    (listener: () => void) => timeline?.subscribe(listener) ?? (() => {}),
    [timeline]
  );
  const getSnapshot = useCallback(() => timeline?.getSnapshot() ?? EMPTY_TIMELINE, [timeline]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const refresh = useCallback(async () => {
    if (!timeline) return EMPTY_TIMELINE;
    setRefreshing(true);
    setError(null);
    try {
      await timeline.open(currentScope.current);
      return timeline.getSnapshot();
    } catch (error) {
      setError(error);
      throw error;
    } finally {
      setRefreshing(false);
    }
  }, [timeline]);

  useEffect(() => {
    if (!timeline) return;
    const activeTimeline = timeline;
    let cancelled = false;

    async function openTimeline() {
      setRefreshing(true);
      setError(null);
      try {
        await activeTimeline.open(currentScope.current);
      } catch (error) {
        if (!cancelled) setError(error);
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    }

    void openTimeline();
    return () => {
      cancelled = true;
    };
  }, [scopeKey, timeline]);

  useEffect(() => {
    return () => {
      void timeline?.close();
    };
  }, [timeline]);

  return { snapshot, refreshing, error, refresh };
}
