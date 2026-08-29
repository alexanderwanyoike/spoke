import { useEffect, useState } from "react";

import { SpokeData, type SpokeApp } from "./data";
import { migrateLegacyPosts } from "./feed/migrate-legacy-posts";
import { createJoltDataClient, createJoltSdk } from "./jolt";

export type SpokeDataConnection = {
  data: SpokeApp | null;
  error: unknown;
};

export type SpokeDataOptions = {
  identity: string;
  sessionToken: string;
  enabled: boolean;
};

export function useSpokeData(options: SpokeDataOptions): SpokeDataConnection {
  const [connection, setConnection] = useState<SpokeDataConnection>({
    data: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    if (!options.enabled || !options.identity) {
      setConnection({ data: null, error: null });
      return;
    }

    setConnection({ data: null, error: null });
    void connectSpokeData(options.identity, options.sessionToken)
      .then((data) => {
        if (!cancelled) setConnection({ data, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) setConnection({ data: null, error });
      });

    return () => {
      cancelled = true;
    };
  }, [options.enabled, options.identity, options.sessionToken]);

  return connection;
}

async function connectSpokeData(identity: string, sessionToken: string) {
  const getSessionToken = () => sessionToken;
  const data = await SpokeData.connect({
    identity,
    client: createJoltDataClient(getSessionToken),
  });
  void migrateLegacyPosts(data, identity, createJoltSdk(getSessionToken)).catch(() => {
    // Historical migration is best-effort; typed posts remain usable if one
    // legacy record or an older node cannot be read.
  });
  return data;
}
