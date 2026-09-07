import { useCallback, useEffect, useState } from "react";
import { apiErrorMessage } from "../jolt";
import type { ActivityGateway } from "./gateway";
export function useActivity(gateway: ActivityGateway) {
  const [data, setData] = useState<Awaited<ReturnType<ActivityGateway["load"]>>>({
    saved: { contacts: [], read: new Set() },
    replies: [],
    unavailable: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const refresh = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const next = await gateway.load();
        if (active) {
          setData(next);
          setError("");
        }
      } catch (cause) {
        if (active) setError(apiErrorMessage(cause));
      } finally {
        if (active) {
          setLoading(false);
          timer = setTimeout(() => void load(), 15000);
        }
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [gateway, attempt]);
  async function markRead(ids: string[]) {
    try {
      await gateway.markRead(ids);
      setData((current) => ({
        ...current,
        saved: { ...current.saved, read: new Set([...current.saved.read, ...ids]) }
      }));
    } finally {
      refresh();
    }
  }
  return { data, loading, error, refresh, markRead };
}
