import { useEffect, useState } from "react";

import { SpokeData, type SpokeApp } from "./data";
import { importLegacyPostsOnce } from "./feed/import-legacy-posts";
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
  void importLegacyPostsInBackground(data, identity, getSessionToken);
  return data;
}

async function importLegacyPostsInBackground(
  data: SpokeApp,
  identity: string,
  getSessionToken: () => string,
) {
  try {
    const result = await importLegacyPostsOnce(data, identity, createJoltSdk(getSessionToken));
    if (result.skipped.length > 0) {
      console.warn("Spoke skipped unreadable legacy posts", result.skipped);
    }
  } catch (error) {
    console.warn("Spoke could not import legacy posts", error);
  }
}
