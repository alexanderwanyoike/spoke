import { useEffect, useState } from "react";
import type { SpokeApp } from "../data";
import { apiErrorMessage } from "../jolt";
import type { HomeGateway } from "./gateway";
type Connection =
  { kind: "loading" } | { kind: "error"; error: string } | { kind: "ready"; data: SpokeApp };
export function useHomeData(gateway: HomeGateway) {
  const [state, setState] = useState<Connection>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setState({ kind: "loading" });
    void gateway.connect().then(
      (data) => {
        if (active) setState({ kind: "ready", data });
      },
      (cause) => {
        if (active) setState({ kind: "error", error: apiErrorMessage(cause) });
      }
    );
    return () => {
      active = false;
    };
  }, [gateway, attempt]);
  return { state, retry: () => setAttempt((value) => value + 1) };
}
