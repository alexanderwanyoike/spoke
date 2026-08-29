import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { SubscriptionState } from "jolt-sdk/data";

import type { SpokeApp } from "../data";
import {
  createFeedTimeline,
  type FeedTimelineSnapshot,
} from "./timeline";
import type { FeedScope } from "./queries";

const EMPTY_TIMELINE: FeedTimelineSnapshot = Object.freeze({
  items: Object.freeze([]),
  state: SubscriptionState.Loading,
  sources: Object.freeze([]),
});

export type SpokeTimeline = FeedTimelineSnapshot & {
  refreshing: boolean;
  error: unknown;
  refresh(): Promise<FeedTimelineSnapshot>;
};

export function useSpokeTimeline(
  data: SpokeApp | null,
  scope: FeedScope,
): SpokeTimeline {
  const timeline = useMemo(() => {
    if (!data) return null;
    return createFeedTimeline(data.posts);
  }, [data]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const refreshGeneration = useRef(0);

  const subscribe = useCallback(
    (listener: () => void) => timeline?.subscribe(listener) ?? (() => {}),
    [timeline],
  );
  const getSnapshot = useCallback(
    () => timeline?.getSnapshot() ?? EMPTY_TIMELINE,
    [timeline],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    return () => {
      void timeline?.close();
    };
  }, [timeline]);

  const refresh = useCallback(async () => {
    if (!timeline) return EMPTY_TIMELINE;
    const generation = ++refreshGeneration.current;
    setRefreshing(true);
    setError(null);
    try {
      await timeline.open({
        localIdentity: scope.localIdentity,
        contacts: scope.contacts,
      });
      return timeline.getSnapshot();
    } catch (error) {
      setError(error);
      throw error;
    } finally {
      if (generation === refreshGeneration.current) setRefreshing(false);
    }
  }, [scope.contacts, scope.localIdentity, timeline]);

  useEffect(() => {
    void refresh().catch(() => {});
  }, [refresh]);

  return { ...snapshot, refreshing, error, refresh };
}
